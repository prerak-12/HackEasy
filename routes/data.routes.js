import { Router } from 'express';
import { generateData } from '../controllers/data.controller.js';
const router = Router();

router.post("/generateData", generateData);

export default router;