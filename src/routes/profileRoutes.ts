import { Router } from 'express';
import {
  createProfile,
  getProfileById,
  getProfiles,
  deleteProfileById
} from '../controllers/profileController';

const router = Router();

router.post('/', createProfile);
router.get('/', getProfiles);
router.get('/:id', getProfileById);
router.delete('/:id', deleteProfileById);

export default router;
