// firebaseUtils.js
import { bucket } from '../server.js';

export const uploadToFirebase = async (file, folder) => {
  if (!file) return null;

  const fileName = `${folder}/${Date.now()}-${file.originalname}`;
  const fileUpload = bucket.file(fileName);

  await fileUpload.save(file.buffer, {
    metadata: { contentType: file.mimetype },
  });

  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;
};

export const deleteFromFirebase = async (url) => {
    try {
      if (!url || typeof url !== 'string') return;
  
      // Improved regex: Supports signed URLs with multiple query params
      const match = url.match(/\/o\/(.*?)\?/);
      if (!match || match.length < 2) {
        console.error('❌ Error: Invalid Firebase URL:', url);
        return;
      }
  
      const fileName = decodeURIComponent(match[1]); // Extract correct filename
      const file = bucket.file(fileName);
  
      await file.delete();
      console.log(`✅ Deleted file from Firebase: ${fileName}`);
    } catch (error) {
      console.error('❌ Error deleting file from Firebase:', error.message);
    }
  };
  
  
