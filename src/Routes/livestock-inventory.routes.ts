import { Router } from 'express';
import { verifyAccessToken } from '../Middlewares/auth.middleware';
import { livestockInventoryController } from '../Controllers/livestock-inventory.controller';

const router = Router();

// All routes require authentication
router.use('/', verifyAccessToken as any);

// Add transaction (purchase, sale, birth, death, transfer)
router.post(
  '/farms/:farmId/transactions',
  livestockInventoryController.addTransaction.bind(livestockInventoryController)
);

// Get transactions with filters
router.get(
  '/farms/:farmId/transactions',
  livestockInventoryController.getTransactions.bind(livestockInventoryController)
);

// Get inventory summary (counts by species/status)
router.get(
  '/farms/:farmId/summary',
  livestockInventoryController.getInventorySummary.bind(livestockInventoryController)
);

// Get mortality report
router.get(
  '/farms/:farmId/mortality',
  livestockInventoryController.getMortalityReport.bind(livestockInventoryController)
);

// Get financial summary (purchases, sales, profit)
router.get(
  '/farms/:farmId/financial',
  livestockInventoryController.getFinancialSummary.bind(livestockInventoryController)
);

// Update transaction
router.put(
  '/transactions/:transactionId',
  livestockInventoryController.updateTransaction.bind(livestockInventoryController)
);

// Delete transaction
router.delete(
  '/transactions/:transactionId',
  livestockInventoryController.deleteTransaction.bind(livestockInventoryController)
);

export default router;
