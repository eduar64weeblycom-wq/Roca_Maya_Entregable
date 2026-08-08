const express = require('express');
const router = express.Router();
const inventarioController = require('../controllers/inventarioMedicamentos.controller');

// Ruta principal que renderiza la vista
router.get('/', async (req, res) => {
    try {
        console.log('Cargando datos para la página de inventario...');
        
        const medicamentosResult = await inventarioController.getMedicamentosData();
        const estadisticasResult = await inventarioController.getEstadisticasData();

        console.log('✅ Medicamentos cargados:', medicamentosResult.data?.length || 0);
        console.log('✅ Estadísticas cargadas:', estadisticasResult.data);

        res.render('inventarioMedicamentos', {
            title: 'Inventario de Medicamentos - Clínicas Roca Maya',
            medicamentos: medicamentosResult.data || [],
            estadisticas: estadisticasResult.data || {
                totalMedicamentos: 0,
                activos: 0,
                stockBajo: 0,
                proximoVencer: 0
            }
        });

    } catch (error) {
        console.error('❌ Error al cargar la página:', error);
        res.render('inventarioMedicamentos', {
            title: 'Inventario de Medicamentos - Clínicas Roca Maya',
            medicamentos: [],
            estadisticas: {
                totalMedicamentos: 0,
                activos: 0,
                stockBajo: 0,
                proximoVencer: 0
            }
        });
    }
});

// API Routes
router.get('/medicamentos', inventarioController.getMedicamentos);
router.get('/estadisticas', inventarioController.getEstadisticas);
router.get('/medicamentos/exportar-excel', inventarioController.exportarExcel);
router.get('/medicamentos/:id', inventarioController.getMedicamentoById);
router.post('/medicamentos', inventarioController.createMedicamento);
router.put('/medicamentos/:id', inventarioController.updateMedicamento);
router.delete('/medicamentos/:id', inventarioController.deleteMedicamento);
router.put('/medicamentos/:id/stock', inventarioController.actualizarStock);

module.exports = router;