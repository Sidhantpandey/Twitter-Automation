import express from 'express';
import { startXAuthController, xOAuthCallbackController } from '../controllers/authController.js';

const router = express.Router();

router.get('/x/start', startXAuthController);
router.get('/x/callback', xOAuthCallbackController);

export default router;
