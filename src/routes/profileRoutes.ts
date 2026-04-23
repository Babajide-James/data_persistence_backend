import { Router } from 'express';
import {
  createProfile,
  getProfileById,
  getProfiles,
  deleteProfileById,
  searchProfiles,
} from '../controllers/profileController';

const router = Router();

// IMPORTANT: /search must be registered BEFORE /:id
// to prevent express matching "search" as an :id parameter
router.get('/search', searchProfiles);

router.post('/', createProfile);
router.get('/', getProfiles);
router.get('/:id', getProfileById);
router.delete('/:id', deleteProfileById);

export default router;
