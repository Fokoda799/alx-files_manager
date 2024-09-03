import { ObjectId } from 'mongodb';
import mime from 'mime-types';
import fs from 'fs';
import Bull from 'bull';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const writeFileAsync = promisify(fs.writeFile);

// Create a Bull queue for processing thumbnail generation
const thumbnailQueue = new Bull('thumbnailQueue');

/**
 * Handles file-related operations for the Files API.
 * @class
 */
class FilesController {
  /**
   * Uploads a file or folder.
   * @static
   * @async
   * @param {Object} req - The request object.
   * @param {Object} res - The response object.
   * @returns {Object} The response object containing the uploaded file or folder details.
   */
  static async postUpload(req, res) {
    // Check if the request contains the x-token header
    const authToken = req.headers['x-token'];
    if (!authToken) return res.status(401).json({ error: 'Unauthorized' });

    // Check if the token is valid
    const userId = await redisClient.get(`auth_${authToken}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Check if the user exists
    const user = await dbClient.findUser({ _id: ObjectId(userId) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Check if the request contains the required fields
    const {
      name, type, parentId, isPublic, data,
    } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (!data && type !== 'folder') return res.status(400).json({ error: 'Missing data' });

    // Check if the parent folder exists
    if (parentId) {
      const parent = await dbClient.findFile({ _id: ObjectId(parentId) });
      if (!parent) return res.status(400).json({ error: 'Parent not found' });
      if (parent.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    // Create the folder
    if (type === 'folder') {
      const newFolder = await dbClient.createFile({
        userId: ObjectId(userId),
        name,
        type,
        isPublic: isPublic || false,
        parentId: parentId || 0,
      });

      // Return the folder details
      return res.status(201).json(newFolder);
    }

    // Create the file
    const buff = Buffer.from(data, 'base64');
    const path = process.env.FOLDER_PATH || '/tmp/files_manager';
    const filePath = `${path}/${uuidv4()}`;

    // Write the file to disk
    try {
      await writeFileAsync(filePath, buff);
      const newFile = await dbClient.createFile({
        userId: ObjectId(userId),
        name,
        type,
        isPublic: isPublic || false,
        parentId: parentId || 0,
        localPath: filePath,
      });

      // Generate thumbnails for images
      if (type === 'image') {
        // Add the file to the thumbnail queue
        thumbnailQueue.add({ userId, fileId: newFile.insertedId });

        // Update the file with the local path
        await dbClient.updateFile({ _id: ObjectId(newFile.insertedId) }, {
          $set: {
            localPath: filePath,
          },
        });
      }

      return res.status(201).json(newFile);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  /**
   * Retrieves information about a specific file.
   * @static
   * @async
   * @param {Object} req - The request object.
   * @param {Object} res - The response object.
   * @returns {Object} The response object containing the file details.
   */
  static async getShow(req, res) {
    const authToken = req.headers['x-token'];
    if (!authToken) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${authToken}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.findUser({ _id: ObjectId(userId) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const fileId = req.params.id;
    const file = await dbClient.findFile({ _id: ObjectId(fileId) });
    if (!file) {
      res.status(404).json({ error: 'Not found' }).end();
    }
    if (String(file.userId) !== String(userId)) {
      res.status(404).json({ error: 'Not found' }).end();
    }
    if (file.userId.toString() !== userId && !file.isPublic) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.status(200).json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    });
  }

  /**
   * Lists files within a specific parent folder, paginated.
   * @static
   * @async
   * @param {Object} req - The request object.
   * @param {Object} res - The response object.
   * @returns {Object[]} The response object containing the list of files.
   */
  static async getIndex(req, res) {
    const tokenValue = req.headers['x-token'];
    if (!tokenValue) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${tokenValue}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.findUser({ _id: ObjectId(userId) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const parentId = req.query.parentId || 0;
    const page = req.query.page || 0; // 0-indexed
    const fileList = await dbClient.aggregateFiles([
      { $match: { parentId } },
      { $skip: page * 20 },
      { $limit: 20 },
    ]);
    const files = fileList.map((file) => ({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    }));
    return res.status(200).json(files);
  }

  /**
   * Publishes a file, making it publicly accessible.
   * @static
   * @async
   * @param {Object} req - The request object.
   * @param {Object} res - The response object.
   * @returns {Object} The response object containing the updated file details.
   */
  static async putPublish(req, res) {
    const tokenValue = req.headers['x-token'];
    if (!tokenValue) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${tokenValue}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.findUser({ _id: ObjectId(userId) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const fileId = req.params.id;
    const file = await dbClient.findFile({ _id: ObjectId(fileId) });
    if (!file) {
      res.status(404).json({ error: 'Not found' }).end();
    }
    if (String(file.userId) !== String(userId)) {
      res.status(404).json({ error: 'Not found' }).end();
    }
    await dbClient.updateFile({ _id: ObjectId(fileId) }, { $set: { isPublic: true } });
    return res.status(200).json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: true,
      parentId: file.parentId,
    });
  }

  /**
   * Unpublishes a file, making it private.
   * @static
   * @async
   * @param {Object} req - The request object.
   * @param {Object} res - The response object.
   * @returns {Object} The response object containing the updated file details.
   */
  static async putUnpublish(req, res) {
    const tokenValue = req.headers['x-token'];
    if (!tokenValue) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${tokenValue}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.findUser({ _id: ObjectId(userId) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const fileId = req.params.id;
    const file = await dbClient.findFile({ _id: ObjectId(fileId) });
    if (!file) {
      res.status(404).json({ error: 'Not found' }).end();
    }
    if (String(file.userId) !== String(userId)) {
      res.status(404).json({ error: 'Not found' }).end();
    }
    await dbClient.updateFile({ _id: ObjectId(fileId) }, { $set: { isPublic: false } });
    return res.status(200).json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: false,
      parentId: file.parentId,
    });
  }

  /**
   * Retrieves the content of a file.
   * @static
   * @async
   * @param {Object} req - The request object.
   * @param {Object} res - The response object.
   * @returns {Stream} A stream of the file's content.
   */
  static async getFile(req, res) {
    const fileId = req.params.id;
    const { size } = req.query;
    const file = await dbClient.findFile({ _id: ObjectId(fileId) });
    if (!file) {
      return res.status(404).json({ error: 'Not found' }).end();
    }
    if (file.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" }).end();
    }
    const tokenValue = req.headers['x-token'];
    if (!tokenValue && !file.isPublic) {
      return res.status(404).json({ error: 'Not found' });
    }
    const userId = await redisClient.get(`auth_${tokenValue}`);
    if (!userId && !file.isPublic) {
      return res.status(404).json({ error: 'Not found' });
    }

    let filePath = file.localPath;

    if (file.type === 'image' && size && ['250', '500', '100'].includes(size)) {
      filePath = `${file.localPath}_${size}`;
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Not found' }).end();
    }

    const mimeType = mime.lookup(file.name); // mime.contentType(file.name);
    res.setHeader('Content-Type', mimeType);
    const readStream = fs.createReadStream(filePath);

    readStream.on('error', (err) => {
      console.log(err);
      res.status(404).json({ error: 'Not found' }).end();
    });
    readStream.pipe(res);
    return res.end();
  }
}

export default FilesController;
