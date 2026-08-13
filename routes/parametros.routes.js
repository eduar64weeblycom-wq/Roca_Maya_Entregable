// ============================================================
// RESTAURACIÓN DE BASE DE DATOS
// POST /parametros/restore
// ============================================================

router.post("/restore", async (req, res) => {

    let connection = null;

    try {

        console.log("==========================================");
        console.log("🔥 RESTAURACIÓN DE BASE DE DATOS");
        console.log("Método:", req.method);
        console.log("URL:", req.originalUrl);
        console.log("Usuario:", req.user?.USUARIO || "NO IDENTIFICADO");
        console.log("==========================================");

        const { backupBase64, nombreArchivo } = req.body;

        // ========================================================
        // VALIDAR ARCHIVO
        // ========================================================

        if (!backupBase64) {

            return res.status(400).json({
                ok: false,
                mensaje: "No se recibió ningún archivo SQL."
            });

        }

        // ========================================================
        // VALIDAR NOMBRE
        // ========================================================

        if (
            nombreArchivo &&
            !nombreArchivo.toLowerCase().endsWith(".sql")
        ) {

            return res.status(400).json({
                ok: false,
                mensaje: "El archivo debe tener extensión .sql."
            });

        }

        // ========================================================
        // OBTENER BASE64
        // ========================================================

        const base64Data = backupBase64.includes(";base64,")
            ? backupBase64.split(";base64,")[1]
            : backupBase64;

        // ========================================================
        // DECODIFICAR
        // ========================================================

        let sqlContent;

        try {

            sqlContent = Buffer
                .from(base64Data, "base64")
                .toString("utf8");

        } catch (decodeError) {

            console.error(
                "❌ Error decodificando Base64:",
                decodeError
            );

            return res.status(400).json({
                ok: false,
                mensaje: "El archivo SQL no pudo ser decodificado."
            });

        }

        // ========================================================
        // VALIDAR CONTENIDO
        // ========================================================

        if (
            !sqlContent ||
            sqlContent.trim().length < 10
        ) {

            return res.status(400).json({
                ok: false,
                mensaje: "El archivo SQL está vacío o es inválido."
            });

        }

        console.log(
            "📄 SQL recibido:",
            sqlContent.length,
            "caracteres"
        );

        // ========================================================
        // CONEXIÓN
        // ========================================================

        connection = await pool.getConnection();

        // ========================================================
        // DESACTIVAR FOREIGN KEYS
        // ========================================================

        await connection.query(
            "SET FOREIGN_KEY_CHECKS = 0"
        );

        // ========================================================
        // TRANSACCIÓN
        // ========================================================

        await connection.beginTransaction();

        // ========================================================
        // SEPARAR SENTENCIAS
        // ========================================================

        const statements = sqlContent
            .split(/;\s*(?:\r?\n|$)/)
            .map(stmt => stmt.trim())
            .filter(stmt => {

                if (!stmt) {
                    return false;
                }

                if (stmt.startsWith("--")) {
                    return false;
                }

                if (stmt.startsWith("/*")) {
                    return false;
                }

                if (stmt.startsWith("//")) {
                    return false;
                }

                return true;

            });

        console.log(
            `📊 Sentencias detectadas: ${statements.length}`
        );

        // ========================================================
        // EJECUTAR SQL
        // ========================================================

        let ejecutados = 0;

        for (const statement of statements) {

            if (!statement) {
                continue;
            }

            try {

                await connection.query(statement);

                ejecutados++;

            } catch (sqlError) {

                console.error(
                    "❌ Error ejecutando sentencia:",
                    sqlError.message
                );

                console.error(
                    "SQL:",
                    statement.substring(0, 500)
                );

                throw sqlError;
            }

        }

        // ========================================================
        // COMMIT
        // ========================================================

        await connection.commit();

        // ========================================================
        // REACTIVAR FOREIGN KEYS
        // ========================================================

        await connection.query(
            "SET FOREIGN_KEY_CHECKS = 1"
        );

        // ========================================================
        // BITÁCORA
        // ========================================================

        try {

            const usuario =
                req.user?.USUARIO ||
                req.usuarioActual ||
                "ADMIN";

            await registrarBitacora({

                usuario,

                accion:
                    "RESTAURACION_BASE_DATOS",

                modulo:
                    "SEGURIDAD",

                descripcion:
                    `Base de datos restaurada correctamente. Archivo: ${nombreArchivo || "backup.sql"}. Sentencias ejecutadas: ${ejecutados}`,

                idRegistro:
                    null,

                tabla:
                    null,

                estado:
                    "EXITO",

                req

            });

        } catch (bitacoraError) {

            console.error(
                "⚠️ Error registrando bitácora:",
                bitacoraError
            );

        }

        // ========================================================
        // RESPUESTA
        // ========================================================

        console.log(
            `✅ Restauración completada: ${ejecutados} sentencias`
        );

        return res.status(200).json({

            ok: true,

            success: true,

            mensaje:
                `Base de datos restaurada exitosamente (${ejecutados} sentencias ejecutadas).`

        });

    } catch (error) {

        console.error(
            "❌ ERROR CRÍTICO EN RESTAURACIÓN:",
            error
        );

        // ========================================================
        // ROLLBACK
        // ========================================================

        if (connection) {

            try {

                await connection.rollback();

            } catch (rollbackError) {

                console.error(
                    "Error en rollback:",
                    rollbackError
                );

            }

            try {

                await connection.query(
                    "SET FOREIGN_KEY_CHECKS = 1"
                );

            } catch (fkError) {

                console.error(
                    "Error restaurando FOREIGN_KEY_CHECKS:",
                    fkError
                );

            }

        }

        return res.status(500).json({

            ok: false,

            success: false,

            mensaje:
                "Error al restaurar la base de datos: " +
                (error.message || "Error desconocido")

        });

    } finally {

        if (connection) {
            connection.release();
        }

    }

});