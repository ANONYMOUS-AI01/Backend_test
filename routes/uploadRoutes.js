import express from 'express';
import multer from 'multer';
import { uploadToFirebase, deleteFromFirebase } from '../utils/firebaseUtils.js'; // ✅ Use helper functions

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Upload Route (to Firebase)
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // ✅ Upload file to Firebase Storage (store all in "uploads" folder)
    const fileUrl = await uploadToFirebase(req.file, 'uploads');

    res.json({ message: 'File uploaded successfully', fileUrl });
  } catch (error) {
    console.error('❌ Upload Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ✅ Delete File Route (optional API)
router.delete('/delete', async (req, res) => {
  try {
    const { fileUrl } = req.body;
    if (!fileUrl) {
      return res.status(400).json({ error: 'File URL is required for deletion' });
    }

    await deleteFromFirebase(fileUrl);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('❌ Delete Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
