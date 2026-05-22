import { Router } from 'express';
import { getData } from '../controllers/data.controller.js';
const router = Router();

router.post("/data", generateData);

export default router;