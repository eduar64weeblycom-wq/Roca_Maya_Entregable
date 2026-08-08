const pool = require("../database/db");

const Recibo = {
  // Obtener todos los recibos
  async getAll(filters = {}) {
    let query = `
        SELECT 
            r.*, 
            CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE
        FROM TBL_RECIBO r
        LEFT JOIN TBL_PACIENTE p ON r.ID_PACIENTE = p.ID_PACIENTE
        WHERE 1=1
    `;
    const params = [];

    // Filtrar por número de recibo
    if (filters.numero) {
      query += " AND r.NUMERO_RECIBO LIKE ?";
      params.push("%" + filters.numero + "%");
    }

    // Filtrar por estado de recibo
    if (filters.estado && filters.estado !== "") {
      query += " AND r.ESTADO_RECIBO = ?";
      params.push(filters.estado);
    }

    // Ordenar por ID de forma descendente
    query += " ORDER BY r.ID_RECIBO DESC";

    const [rows] = await pool.query(query, params);
    return rows;
  },

  // Obtener recibo y sus detalles por ID (MODIFICADA)
  async getById(id) {
    const [reciboRows] = await pool.query(
      `SELECT r.*, 
              CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
              p.RTN_PACIENTE AS RTN_PACIENTE
       FROM TBL_RECIBO r
       LEFT JOIN TBL_PACIENTE p ON r.ID_PACIENTE = p.ID_PACIENTE
       WHERE r.ID_RECIBO = ?`,
      [id]
    );

    const recibo = reciboRows[0];

    if (recibo) {
        // Obtener los detalles del recibo
        const [detallesRows] = await pool.query(
            `SELECT 
                rd.ID_DETALLE, rd.CANTIDAD, rd.PRECIO_UNITARIO, rd.TOTAL,
                s.NOMBRE_SERVICIO
             FROM TBL_RECIBO_DETALLE rd
             JOIN TBL_SERVICIOS_MEDICOS s ON rd.ID_SERVICIO = s.ID_SERVICIO
             WHERE rd.ID_RECIBO = ?`,
            [id]
        );
        recibo.DETALLES = detallesRows;
    }

    return recibo;
  },

  // Obtener datos del paciente por ID
  async getPatientDataById(id) {
    const [rows] = await pool.query(
      `SELECT 
            ID_PACIENTE, 
            CONCAT(NOMBRES, ' ', APELLIDOS) AS NOMBRE_COMPLETO,
            RTN_PACIENTE 
       FROM TBL_PACIENTE 
       WHERE ID_PACIENTE = ?`,
      [id]
    );
    return rows[0];
  },

  // Obtener datos de la cita por ID
  async getCitaDataById(idCita) {
    const [rows] = await pool.query(
      `SELECT 
            c.ID_CITA, 
            c.ID_PACIENTE, 
            c.FECHA_CITA, 
            c.MOTIVO_CITA,
            CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
            p.RTN_PACIENTE
       FROM TBL_CITA c
       JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
       WHERE c.ID_CITA = ?`,
      [idCita]
    );
    return rows[0];
  },

  // NUEVA FUNCIÓN: Obtener servicios médicos activos
  async getServices() {
    const query = `
        SELECT ID_SERVICIO, NOMBRE_SERVICIO, PRECIO_UNITARIO, TIPO_SERVICIO
        FROM TBL_SERVICIOS_MEDICOS
        WHERE ESTADO = 'ACTIVO'
        ORDER BY NOMBRE_SERVICIO;
    `;
    const [rows] = await pool.query(query);
    return rows;
  },

  // FUNCIÓN CORREGIDA: Creación del recibo con detalles
  async create(data) {
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();
      
      // 1. Obtener el último NUMERO_RECIBO e incrementarlo
      const [maxRecibo] = await conn.execute(
        "SELECT MAX(NUMERO_RECIBO) AS MAX_NUM FROM TBL_RECIBO"
      );
      const lastNumeroRecibo = maxRecibo[0].MAX_NUM || 0;
      const newNumeroRecibo = lastNumeroRecibo + 1; 

      const fechaPago = data.ESTADO_RECIBO === 'PAGADA' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
      
      // 2. Insertar el encabezado del recibo
      // CORRECCIÓN: Se agrega la columna TIPO_PAGO a la consulta.
      let query = `
        INSERT INTO TBL_RECIBO (
          NUMERO_RECIBO, ID_CITA, ID_PACIENTE, SUBTOTAL, DESCUENTO, ISV, MONTO_TOTAL, 
          SALDO_PENDIENTE, ESTADO_RECIBO, FECHA_EMISION, FECHA_PAGO, TIPO_PAGO
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
      `;
      
      const params = [
        newNumeroRecibo, 
        data.ID_CITA,
        data.ID_PACIENTE,
        data.SUBTOTAL,
        data.DESCUENTO,
        data.ISV,
        data.MONTO_TOTAL,
        data.SALDO_PENDIENTE,
        data.ESTADO_RECIBO,
        fechaPago,
        data.TIPO_PAGO, // CORRECCIÓN: Se agrega data.TIPO_PAGO a los parámetros.
      ];

      const [result] = await conn.execute(query, params);
      const newReciboId = result.insertId;

      // 3. Insertar los detalles del recibo
      if (data.DETALLES && data.DETALLES.length > 0) {
        let detalleQuery = `
          INSERT INTO TBL_RECIBO_DETALLE (ID_RECIBO, ID_SERVICIO, CANTIDAD, PRECIO_UNITARIO, TOTAL) 
          VALUES (?, ?, ?, ?, ?)
        `;
        
        for (const detalle of data.DETALLES) {
            // Recalcular el total del detalle por seguridad
            const detalleTotal = parseFloat(detalle.CANTIDAD) * parseFloat(detalle.PRECIO_UNITARIO);

            const detalleParams = [
                newReciboId,
                detalle.ID_SERVICIO,
                detalle.CANTIDAD,
                detalle.PRECIO_UNITARIO,
                detalleTotal.toFixed(2)
            ];
            await conn.execute(detalleQuery, detalleParams);
        }
      } else {
          throw new Error("ERROR: Debe haber al menos un detalle de servicio.");
      }

      await conn.commit();
      
      // 4. Retornar el ID y el NÚMERO de recibo
      return { ID_RECIBO: newReciboId, NUMERO_RECIBO: newNumeroRecibo };

    } catch (error) {
      if (conn) await conn.rollback();
      console.error("Error en Recibo.create:", error.message);
      // Lanzar un error más descriptivo
      throw new Error(`ERROR: No se pudo crear el recibo. ${error.message}`);
    } finally {
      if (conn) conn.release();
    }
  },

  // Función para actualizar el estado del recibo
  async updateStatus(id, newStatus, montoTotalToRestore) {
      const [currentRecibo] = await pool.query("SELECT * FROM TBL_RECIBO WHERE ID_RECIBO = ?", [id]);
      if (!currentRecibo || currentRecibo.length === 0) {
          throw new Error("ERROR: Recibo no encontrado.");
      }
      
      let query = '';
      let params = [];
      const current = currentRecibo[0];

      if (newStatus === 'PAGADA') {
          if (current.ESTADO_RECIBO !== 'PENDIENTE') {
              throw new Error(`ERROR: Solo los recibos PENDIENTES pueden ser marcados como PAGADOS. (Estado actual: ${current.ESTADO_RECIBO})`);
          }

          query = `UPDATE TBL_RECIBO 
                   SET ESTADO_RECIBO = 'PAGADA', 
                       SALDO_PENDIENTE = 0.00,
                       FECHA_PAGO = NOW() 
                   WHERE ID_RECIBO = ?`;
          params = [id];
      } else if (newStatus === 'ANULADA') {
          if (current.ESTADO_RECIBO !== 'PENDIENTE') {
              throw new Error(`ERROR: Solo los recibos PENDIENTES pueden ser ANULADOS. (Estado actual: ${current.ESTADO_RECIBO})`);
          }
        
          query = `UPDATE TBL_RECIBO 
                   SET ESTADO_RECIBO = 'ANULADA' 
                   WHERE ID_RECIBO = ?`;
          params = [id];
      } else {
          throw new Error(`ERROR: Estado de recibo no válido: ${newStatus}`);
      }

      await pool.query(query, params);
      return { ID_RECIBO: id, newStatus: newStatus };
  }
};

module.exports = Recibo;