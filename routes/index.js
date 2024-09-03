import express from 'express';
import AppController from '../controllers/AppController';
import UserController from '../controllers/UsersController';
import AuthController from '../controllers/AuthController';
import FilesController from '../controllers/FilesController';

const router = express.Router();

// Get status of the API
router.get('/status', AppController.getstatus);
// Get stats of the API
router.get('/state', AppController.getstats);
// Post a new user
router.post('/users', UserController.postNew);
// Get a user by ID
router.get('/users/me', UserController.getMe);
// Authtenticate a user
router.get('/connect', AuthController.getConnect);
// Disconnect a user
router.get('/disconnect', AuthController.getDisconnect);
// Post files
router.post('/files', FilesController.postUpload);
router.get('/files/:id', FilesController.getShow);
router.get('/files', FilesController.getIndex);
router.put('/files/:id/publish', FilesController.putPublish);
router.get('files/:id/data', FilesController.getFile);

export default router;
