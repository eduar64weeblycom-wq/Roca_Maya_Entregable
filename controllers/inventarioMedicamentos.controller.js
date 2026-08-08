const db = require('../database/db');

const inventarioController = {

    // =====================================================
    // HELPER: Registrar en bitácora usando el SP real
    // =====================================================
    registrarBitacora: async (idUsuario, accion, descripcion, modulo = 'FARMACIA', idRegistro = null, tabla = 'TBL_INVENTARIO_MEDICAMENTOS', estado = 'EXITO', detalleError = null, usuarioCreacion = 'SISTEMA') => {
        try {
            await db.query(
                `CALL SP_REGISTRAR_BITACORA(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    idUsuario || null,
                    accion,
                    descripcion,
                    modulo,
                    idRegistro,
                    tabla,
                    null,               // IP_CLIENTE
                    null,               // USER_AGENT
                    estado,
                    detalleError,
                    usuarioCreacion
                ]
            );
        } catch (error) {
            console.error('❌ Error al registrar en bitácora:', error.message);
        }
    },

    // =====================================================
    // HELPER: Limpiar y normalizar un medicamento
    // =====================================================
    limpiarMedicamento: (med) => {
        return {
            ID_MEDICAMENTO: parseInt(med.ID_MEDICAMENTO) || 0,
            NOMBRE_MEDICAMENTO: med.NOMBRE_MEDICAMENTO?.toString().trim() || 'Sin nombre',
            NOMBRE_GENERICO: med.NOMBRE_GENERICO?.toString().trim() || '',
            DESCRIPCION: med.DESCRIPCION?.toString().trim() || '',
            PRESENTACION: med.PRESENTACION?.toString().trim() || '',
            CONCENTRACION: med.CONCENTRACION?.toString().trim() || '',
            VIA_ADMINISTRACION: med.VIA_ADMINISTRACION?.toString().trim() || '',
            STOCK_ACTUAL: parseInt(med.STOCK_ACTUAL) || 0,
            STOCK_MINIMO: parseInt(med.STOCK_MINIMO) || 10,
            STOCK_MAXIMO: parseInt(med.STOCK_MAXIMO) || 100,
            PRECIO_COMPRA: parseFloat(med.PRECIO_COMPRA) || 0,
            PRECIO_VENTA: parseFloat(med.PRECIO_VENTA) || 0,
            LOTE: med.LOTE?.toString().trim() || '',
            FECHA_VENCIMIENTO: med.FECHA_VENCIMIENTO || null,
            PROVEEDOR: med.PROVEEDOR?.toString().trim() || '',
            REQUIERE_RECETA: Boolean(med.REQUIERE_RECETA),
            ESTADO: med.ESTADO || 'ACTIVO'
        };
    },

    // =====================================================
    // Obtener todos los medicamentos (uso interno)
    // =====================================================
    getMedicamentosData: async () => {
        try {
            const query = `
                SELECT 
                    ID_MEDICAMENTO,
                    NOMBRE_MEDICAMENTO,
                    COALESCE(NOMBRE_GENERICO, '') AS NOMBRE_GENERICO,
                    COALESCE(DESCRIPCION, '') AS DESCRIPCION,
                    COALESCE(PRESENTACION, '') AS PRESENTACION,
                    COALESCE(CONCENTRACION, '') AS CONCENTRACION,
                    COALESCE(VIA_ADMINISTRACION, '') AS VIA_ADMINISTRACION,
                    COALESCE(STOCK_ACTUAL, 0) AS STOCK_ACTUAL,
                    COALESCE(STOCK_MINIMO, 10) AS STOCK_MINIMO,
                    COALESCE(STOCK_MAXIMO, 100) AS STOCK_MAXIMO,
                    COALESCE(PRECIO_COMPRA, 0) AS PRECIO_COMPRA,
                    COALESCE(PRECIO_VENTA, 0) AS PRECIO_VENTA,
                    COALESCE(LOTE, '') AS LOTE,
                    DATE_FORMAT(FECHA_VENCIMIENTO, '%Y-%m-%d') AS FECHA_VENCIMIENTO,
                    COALESCE(PROVEEDOR, '') AS PROVEEDOR,
                    COALESCE(REQUIERE_RECETA, 1) AS REQUIERE_RECETA,
                    COALESCE(ESTADO, 'ACTIVO') AS ESTADO
                FROM tbl_inventario_medicamentos
                ORDER BY ID_MEDICAMENTO ASC
            `;

            const [medicamentos] = await db.query(query);
            const medicamentosLimpios = medicamentos.map(med => inventarioController.limpiarMedicamento(med));

            return {
                success: true,
                data: medicamentosLimpios,
                total: medicamentosLimpios.length
            };
        } catch (error) {
            console.error('Error al obtener medicamentos:', error);
            return {
                success: false,
                message: 'Error al obtener los medicamentos: ' + error.message,
                data: []
            };
        }
    },

    // =====================================================
    // Estadísticas (uso interno)
    // =====================================================
    getEstadisticasData: async () => {
        try {
            const [[totalResult]] = await db.query(`SELECT COUNT(*) as total FROM tbl_inventario_medicamentos`);
            const [[activosResult]] = await db.query(`SELECT COUNT(*) as activos FROM tbl_inventario_medicamentos WHERE ESTADO = 'ACTIVO'`);
            const [[stockBajoResult]] = await db.query(`
                SELECT COUNT(*) as stockBajo 
                FROM tbl_inventario_medicamentos 
                WHERE STOCK_ACTUAL <= STOCK_MINIMO AND ESTADO = 'ACTIVO'
            `);
            const [[proximoVencerResult]] = await db.query(`
                SELECT COUNT(*) as proximoVencer 
                FROM tbl_inventario_medicamentos 
                WHERE FECHA_VENCIMIENTO BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
                AND ESTADO = 'ACTIVO'
            `);

            return {
                success: true,
                data: {
                    totalMedicamentos: parseInt(totalResult.total) || 0,
                    activos: parseInt(activosResult.activos) || 0,
                    stockBajo: parseInt(stockBajoResult.stockBajo) || 0,
                    proximoVencer: parseInt(proximoVencerResult.proximoVencer) || 0
                }
            };
        } catch (error) {
            console.error('Error al obtener estadísticas:', error);
            return {
                success: false,
                message: 'Error al obtener las estadísticas: ' + error.message,
                data: {
                    totalMedicamentos: 0,
                    activos: 0,
                    stockBajo: 0,
                    proximoVencer: 0
                }
            };
        }
    },

    // =====================================================
    // API: Listar medicamentos
    // =====================================================
    getMedicamentos: async (req, res) => {
        try {
            const result = await inventarioController.getMedicamentosData();
            res.json(result);
        } catch (error) {
            console.error('Error en API getMedicamentos:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener los medicamentos: ' + error.message,
                data: []
            });
        }
    },

    // =====================================================
    // API: Estadísticas
    // =====================================================
    getEstadisticas: async (req, res) => {
        try {
            const result = await inventarioController.getEstadisticasData();
            res.json(result);
        } catch (error) {
            console.error('Error en API getEstadisticas:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener las estadísticas: ' + error.message,
                data: {
                    totalMedicamentos: 0,
                    activos: 0,
                    stockBajo: 0,
                    proximoVencer: 0
                }
            });
        }
    },

    // =====================================================
    // API: Obtener un medicamento por ID
    // =====================================================
    getMedicamentoById: async (req, res) => {
        try {
            const { id } = req.params;

            const query = `
                SELECT 
                    ID_MEDICAMENTO,
                    NOMBRE_MEDICAMENTO,
                    COALESCE(NOMBRE_GENERICO, '') AS NOMBRE_GENERICO,
                    COALESCE(DESCRIPCION, '') AS DESCRIPCION,
                    COALESCE(PRESENTACION, '') AS PRESENTACION,
                    COALESCE(CONCENTRACION, '') AS CONCENTRACION,
                    COALESCE(VIA_ADMINISTRACION, '') AS VIA_ADMINISTRACION,
                    COALESCE(STOCK_ACTUAL, 0) AS STOCK_ACTUAL,
                    COALESCE(STOCK_MINIMO, 10) AS STOCK_MINIMO,
                    COALESCE(STOCK_MAXIMO, 100) AS STOCK_MAXIMO,
                    COALESCE(PRECIO_COMPRA, 0) AS PRECIO_COMPRA,
                    COALESCE(PRECIO_VENTA, 0) AS PRECIO_VENTA,
                    COALESCE(LOTE, '') AS LOTE,
                    DATE_FORMAT(FECHA_VENCIMIENTO, '%Y-%m-%d') AS FECHA_VENCIMIENTO,
                    COALESCE(PROVEEDOR, '') AS PROVEEDOR,
                    COALESCE(REQUIERE_RECETA, 1) AS REQUIERE_RECETA,
                    COALESCE(ESTADO, 'ACTIVO') AS ESTADO
                FROM tbl_inventario_medicamentos 
                WHERE ID_MEDICAMENTO = ?
            `;

            const [rows] = await db.query(query, [id]);

            if (rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Medicamento no encontrado'
                });
            }

            res.json({
                success: true,
                data: inventarioController.limpiarMedicamento(rows[0])
            });

        } catch (error) {
            console.error('Error al obtener medicamento:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener el medicamento: ' + error.message
            });
        }
    },

    // =====================================================
    // API: Crear medicamento
    // =====================================================
    createMedicamento: async (req, res) => {
        try {
            // TODO: Reemplazar cuando tengas autenticación real
            const idUsuario = req.user?.id || req.usuario?.id || 1;
            const usuario = req.user?.usuario || req.usuario?.usuario || 'ADMIN';

            const {
                NOMBRE_MEDICAMENTO,
                NOMBRE_GENERICO,
                DESCRIPCION,
                PRESENTACION,
                CONCENTRACION,
                VIA_ADMINISTRACION,
                STOCK_ACTUAL,
                STOCK_MINIMO,
                STOCK_MAXIMO,
                PRECIO_COMPRA,
                PRECIO_VENTA,
                LOTE,
                FECHA_VENCIMIENTO,
                PROVEEDOR,
                REQUIERE_RECETA,
                ESTADO
            } = req.body;

            if (!NOMBRE_MEDICAMENTO || NOMBRE_MEDICAMENTO.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'El nombre del medicamento es requerido'
                });
            }

            const query = `
                INSERT INTO tbl_inventario_medicamentos (
                    NOMBRE_MEDICAMENTO, NOMBRE_GENERICO, DESCRIPCION, PRESENTACION,
                    CONCENTRACION, VIA_ADMINISTRACION, STOCK_ACTUAL, STOCK_MINIMO,
                    STOCK_MAXIMO, PRECIO_COMPRA, PRECIO_VENTA, LOTE, FECHA_VENCIMIENTO,
                    PROVEEDOR, REQUIERE_RECETA, ESTADO, ID_USUARIO_REGISTRO, USUARIO_CREACION
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const [result] = await db.query(query, [
                NOMBRE_MEDICAMENTO.trim(),
                NOMBRE_GENERICO?.trim() || null,
                DESCRIPCION?.trim() || null,
                PRESENTACION?.trim() || null,
                CONCENTRACION?.trim() || null,
                VIA_ADMINISTRACION?.trim() || null,
                STOCK_ACTUAL ?? 0,
                STOCK_MINIMO ?? 10,
                STOCK_MAXIMO ?? 100,
                PRECIO_COMPRA ?? 0,
                PRECIO_VENTA ?? 0,
                LOTE?.trim() || null,
                FECHA_VENCIMIENTO || null,
                PROVEEDOR?.trim() || null,
                REQUIERE_RECETA !== undefined ? (REQUIERE_RECETA ? 1 : 0) : 1,
                ESTADO || 'ACTIVO',
                idUsuario,
                usuario
            ]);

            // El trigger TR_AUDITORIA_MEDICAMENTOS_INSERT ya registra la creación.
            // Solo registramos extra si queremos más detalle.
            await inventarioController.registrarBitacora(
                idUsuario,
                'CREAR_MEDICAMENTO',
                `Se creó el medicamento: ${NOMBRE_MEDICAMENTO} (ID: ${result.insertId})`,
                'FARMACIA',
                result.insertId,
                'TBL_INVENTARIO_MEDICAMENTOS',
                'EXITO',
                null,
                usuario
            );

            res.status(201).json({
                success: true,
                message: 'Medicamento creado exitosamente',
                data: { id: result.insertId }
            });

        } catch (error) {
            console.error('Error al crear medicamento:', error);
            res.status(500).json({
                success: false,
                message: 'Error al crear el medicamento: ' + error.message
            });
        }
    },

    // =====================================================
    // API: Actualizar medicamento
    // =====================================================
    updateMedicamento: async (req, res) => {
        try {
            const { id } = req.params;
            const idUsuario = req.user?.id || req.usuario?.id || 1;
            const usuario = req.user?.usuario || req.usuario?.usuario || 'ADMIN';

            const {
                NOMBRE_MEDICAMENTO,
                NOMBRE_GENERICO,
                DESCRIPCION,
                PRESENTACION,
                CONCENTRACION,
                VIA_ADMINISTRACION,
                STOCK_ACTUAL,
                STOCK_MINIMO,
                STOCK_MAXIMO,
                PRECIO_COMPRA,
                PRECIO_VENTA,
                LOTE,
                FECHA_VENCIMIENTO,
                PROVEEDOR,
                REQUIERE_RECETA,
                ESTADO
            } = req.body;

            if (!NOMBRE_MEDICAMENTO || NOMBRE_MEDICAMENTO.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'El nombre del medicamento es requerido'
                });
            }

            // Obtener nombre anterior (solo para mensaje más legible)
            const [actual] = await db.query(
                'SELECT NOMBRE_MEDICAMENTO FROM tbl_inventario_medicamentos WHERE ID_MEDICAMENTO = ?',
                [id]
            );

            if (actual.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Medicamento no encontrado'
                });
            }

            const nombreAnterior = actual[0].NOMBRE_MEDICAMENTO;

            const query = `
                UPDATE tbl_inventario_medicamentos SET
                    NOMBRE_MEDICAMENTO = ?,
                    NOMBRE_GENERICO = ?,
                    DESCRIPCION = ?,
                    PRESENTACION = ?,
                    CONCENTRACION = ?,
                    VIA_ADMINISTRACION = ?,
                    STOCK_ACTUAL = ?,
                    STOCK_MINIMO = ?,
                    STOCK_MAXIMO = ?,
                    PRECIO_COMPRA = ?,
                    PRECIO_VENTA = ?,
                    LOTE = ?,
                    FECHA_VENCIMIENTO = ?,
                    PROVEEDOR = ?,
                    REQUIERE_RECETA = ?,
                    ESTADO = ?,
                    USUARIO_MODIFICACION = ?
                WHERE ID_MEDICAMENTO = ?
            `;

            const [result] = await db.query(query, [
                NOMBRE_MEDICAMENTO.trim(),
                NOMBRE_GENERICO?.trim() || null,
                DESCRIPCION?.trim() || null,
                PRESENTACION?.trim() || null,
                CONCENTRACION?.trim() || null,
                VIA_ADMINISTRACION?.trim() || null,
                STOCK_ACTUAL ?? 0,
                STOCK_MINIMO ?? 10,
                STOCK_MAXIMO ?? 100,
                PRECIO_COMPRA ?? 0,
                PRECIO_VENTA ?? 0,
                LOTE?.trim() || null,
                FECHA_VENCIMIENTO || null,
                PROVEEDOR?.trim() || null,
                REQUIERE_RECETA !== undefined ? (REQUIERE_RECETA ? 1 : 0) : 1,
                ESTADO || 'ACTIVO',
                usuario,
                id
            ]);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Medicamento no encontrado'
                });
            }

            // El trigger ya registra cambios de stock/precio/estado.
            // Registramos uno extra con más contexto.
            await inventarioController.registrarBitacora(
                idUsuario,
                'ACTUALIZAR_MEDICAMENTO',
                `Se actualizó el medicamento: ${nombreAnterior} → ${NOMBRE_MEDICAMENTO} (ID: ${id})`,
                'FARMACIA',
                id,
                'TBL_INVENTARIO_MEDICAMENTOS',
                'EXITO',
                null,
                usuario
            );

            res.json({
                success: true,
                message: 'Medicamento actualizado exitosamente'
            });

        } catch (error) {
            console.error('Error al actualizar medicamento:', error);
            res.status(500).json({
                success: false,
                message: 'Error al actualizar el medicamento: ' + error.message
            });
        }
    },

    // =====================================================
    // API: Eliminar (soft delete)
    // =====================================================
    deleteMedicamento: async (req, res) => {
        try {
            const { id } = req.params;
            const idUsuario = req.user?.id || req.usuario?.id || 1;
            const usuario = req.user?.usuario || req.usuario?.usuario || 'ADMIN';

            const [medicamento] = await db.query(
                'SELECT NOMBRE_MEDICAMENTO FROM tbl_inventario_medicamentos WHERE ID_MEDICAMENTO = ?',
                [id]
            );

            if (medicamento.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Medicamento no encontrado'
                });
            }

            const nombreMedicamento = medicamento[0].NOMBRE_MEDICAMENTO;

            const [result] = await db.query(
                `UPDATE tbl_inventario_medicamentos 
                 SET ESTADO = 'INACTIVO', USUARIO_MODIFICACION = ?
                 WHERE ID_MEDICAMENTO = ?`,
                [usuario, id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Medicamento no encontrado'
                });
            }

            await inventarioController.registrarBitacora(
                idUsuario,
                'ELIMINAR_MEDICAMENTO',
                `Se inactivó el medicamento: ${nombreMedicamento} (ID: ${id})`,
                'FARMACIA',
                id,
                'TBL_INVENTARIO_MEDICAMENTOS',
                'EXITO',
                null,
                usuario
            );

            res.json({
                success: true,
                message: 'Medicamento eliminado exitosamente'
            });

        } catch (error) {
            console.error('Error al eliminar medicamento:', error);
            res.status(500).json({
                success: false,
                message: 'Error al eliminar el medicamento: ' + error.message
            });
        }
    },
       // =====================================================
    // API: Ajustar stock
    // =====================================================
    actualizarStock: async (req, res) => {
        try {
            const { id } = req.params;
            const { accion, cantidad } = req.body;
            const idUsuario = req.user?.id || req.usuario?.id || 1;
            const usuario = req.user?.usuario || req.usuario?.usuario || 'ADMIN';

            if (!accion || !cantidad || cantidad <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Acción y cantidad válida son requeridas'
                });
            }

            const [medicamento] = await db.query(
                `SELECT NOMBRE_MEDICAMENTO, STOCK_ACTUAL 
                 FROM tbl_inventario_medicamentos 
                 WHERE ID_MEDICAMENTO = ?`,
                [id]
            );

            if (medicamento.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Medicamento no encontrado'
                });
            }

            const nombreMedicamento = medicamento[0].NOMBRE_MEDICAMENTO;
            const stockActual = parseInt(medicamento[0].STOCK_ACTUAL) || 0;
            let nuevoStock = stockActual;

            if (accion === 'agregar') {
                nuevoStock = stockActual + parseInt(cantidad);
            } else if (accion === 'quitar') {
                nuevoStock = Math.max(0, stockActual - parseInt(cantidad));
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Acción no válida. Use "agregar" o "quitar"'
                });
            }

            const [result] = await db.query(
                `UPDATE tbl_inventario_medicamentos 
                 SET STOCK_ACTUAL = ?, USUARIO_MODIFICACION = ?
                 WHERE ID_MEDICAMENTO = ?`,
                [nuevoStock, usuario, id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Medicamento no encontrado'
                });
            }

            await inventarioController.registrarBitacora(
                idUsuario,
                'AJUSTAR_STOCK',
                `Stock ${accion === 'agregar' ? 'aumentado' : 'disminuido'} para ${nombreMedicamento}: ${stockActual} → ${nuevoStock} (${accion === 'agregar' ? '+' : '-'}${cantidad})`,
                'FARMACIA',
                id,
                'TBL_INVENTARIO_MEDICAMENTOS',
                'EXITO',
                null,
                usuario
            );

            res.json({
                success: true,
                message: 'Stock actualizado exitosamente',
                data: { nuevoStock }
            });

        } catch (error) {
            console.error('Error al actualizar stock:', error);
            res.status(500).json({
                success: false,
                message: 'Error al actualizar el stock: ' + error.message
            });
        }
    },

    // =====================================================
    // API: Exportar Excel
    // =====================================================
    exportarExcel: async (req, res) => {
        try {
            const result = await inventarioController.getMedicamentosData();

            if (!result.success) {
                return res.status(500).json({
                    success: false,
                    message: 'No se pudieron obtener los medicamentos'
                });
            }

            const excelService = require('../services/excel.service');
            await excelService.generarExcelMedicamentos(result.data, res);

        } catch (error) {
            console.error('Error al exportar Excel de medicamentos:', error);
            res.status(500).json({
                success: false,
                message: 'Error al generar el archivo Excel: ' + error.message
            });
        }
    }

};

module.exports = inventarioController;