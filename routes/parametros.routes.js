// ============================================================
// RESTAURACIÓN DE BASE DE DATOS
// ============================================================

router.post('/restaurar', async (req, res) => {

    let connection = null;

    try {

        console.log('==========================================');
        console.log('🔥 RESTAURACIÓN RECIBIDA');
        console.log('Método:', req.method);
        console.log('URL:', req.originalUrl);
        console.log('Content-Type:', req.headers['content-type']);
        console.log('==========================================');

        const { backupBase64 } = req.body;

        if (!backupBase64) {
            return res.status(400).json({
                ok: false,
                mensaje: 'No se recibió ningún archivo SQL.'
            });
        }

        // ====================================================
        // VALIDAR DATA URL
        // ====================================================

        let base64Data = backupBase64;

        if (base64Data.includes(';base64,')) {
            base64Data = base64Data.split(';base64,')[1];
        }

        if (!base64Data || base64Data.trim().length === 0) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El contenido del archivo SQL está vacío.'
            });
        }

        // ====================================================
        // DECODIFICAR BASE64
        // ====================================================

        const sqlContent = Buffer
            .from(base64Data, 'base64')
            .toString('utf8');

        if (!sqlContent || sqlContent.trim().length < 10) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El archivo SQL está vacío o es inválido.'
            });
        }

        console.log(
            `📄 Archivo SQL recibido: ${sqlContent.length} caracteres`
        );

        // ====================================================
        // OBTENER CONEXIÓN
        // ====================================================

        connection = await pool.getConnection();

        // ====================================================
        // DESACTIVAR FOREIGN KEY
        // ====================================================

        await connection.query(
            'SET FOREIGN_KEY_CHECKS = 0'
        );

        await connection.beginTransaction();

        // ====================================================
        // SEPARAR SENTENCIAS
        // ====================================================

        const statements = sqlContent
            .split(/;\s*(?:\r?\n|$)/)
            .map(statement => statement.trim())
            .filter(statement => {

                if (!statement) {
                    return false;
                }

                if (statement.startsWith('--')) {
                    return false;
                }

                if (statement.startsWith('/*')) {
                    return false;
                }

                if (statement.startsWith('//')) {
                    return false;
                }

                return true;
            });

        console.log(
            `📄 Sentencias encontradas: ${statements.length}`
        );

        // ====================================================
        // EJECUTAR SQL
        // ====================================================

        let ejecutados = 0;

        for (const statement of statements) {

            try {

                await connection.query(statement);

                ejecutados++;

            } catch (sqlError) {

                console.error(
                    '❌ Error ejecutando sentencia:',
                    sqlError.message
                );

                console.error(
                    'Sentencia:',
                    statement.substring(0, 500)
                );

                throw sqlError;
            }
        }

        // ====================================================
        // COMMIT
        // ====================================================

        await connection.commit();

        await connection.query(
            'SET FOREIGN_KEY_CHECKS = 1'
        );

        // ====================================================
        // BITÁCORA
        // ====================================================

        try {

            const usuario = req.user || {
                ID_USUARIO: 1,
                USUARIO: 'ADMIN'
            };

            await registrarBitacora({
                usuario:
                    usuario.USUARIO ||
                    usuario.usuarioActual ||
                    'ADMIN',

                accion: 'RESTAURACION_BASE_DATOS',

                descripcion:
                    `Base de datos restaurada exitosamente. ` +
                    `${ejecutados} sentencias ejecutadas.`,

                modulo: 'SEGURIDAD',

                idRegistro: null,

                tabla: null,

                estado: 'EXITO',

                req
            });

        } catch (bitacoraError) {

            console.error(
                '⚠️ Error registrando restauración en bitácora:',
                bitacoraError.message
            );
        }

        // ====================================================
        // RESPUESTA
        // ====================================================

        return res.json({
            ok: true,
            success: true,
            mensaje:
                `Base de datos restaurada exitosamente. ` +
                `${ejecutados} sentencias ejecutadas.`
        });

    } catch (error) {

        console.error(
            '❌ ERROR CRÍTICO RESTAURANDO BASE DE DATOS:',
            error
        );

        if (connection) {

            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    'Error en rollback:',
                    rollbackError.message
                );
            }

            try {
                await connection.query(
                    'SET FOREIGN_KEY_CHECKS = 1'
                );
            } catch (fkError) {
                console.error(
                    'Error restaurando FOREIGN_KEY_CHECKS:',
                    fkError.message
                );
            }
        }

        return res.status(500).json({
            ok: false,
            success: false,
            mensaje:
                'Error al restaurar la base de datos: ' +
                (error.message || 'Error desconocido')
        });

    } finally {

        if (connection) {
            connection.release();
        }
    }
});