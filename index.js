import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import http from 'http';
import puppeteer from 'puppeteer';
import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis'; // Correct named import for v8.0.2
import Player from './models/Player.js';
import Leader from './models/Leader.js';
import multer from 'multer';
import firebaseAdmin from 'firebase-admin'; // ES Modules import
import { getStorage } from 'firebase-admin/storage';
import fs from 'fs'
import playerRoutes from './routes/playerRoutes.js';
import leaderRoutes from './routes/leaderRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import soldPlayerRoutes from './routes/soldPlayerRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';  // ✅ Import upload routes

// Load Firebase service account key
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };
dotenv.config();

// Initialize Firebase using the environment variable
firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});


const bucket = firebaseAdmin.storage().bucket();
export { bucket };

const PORT = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'https://hpl-public-form-bhaskar01.vercel.app',  // Deployed frontend
      'http://localhost:5173',  
      'http://localhost:5174'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

// Redis setup
const redisClient = createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
  password: process.env.REDIS_PASSWORD || undefined,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000), // Retry with backoff
  },
});

redisClient.on('error', (err) => console.error('❌ Redis Client Error:', err));
redisClient.on('connect', () => console.log('✅ Connected to Redis'));

(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error('❌ Failed to connect to Redis:', err);
  }
})();

// Session middleware
app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // Always true on Vercel
      httpOnly: true,
      sameSite: 'lax', // Helps with CSRF
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);

if (process.env.NODE_ENV !== 'production') {
  console.warn('Warning: Session cookies are not secure in development mode');
}

// Multer setup
// ✅ New Code (Uploads to Firebase Storage)
const upload = multer({ storage: multer.memoryStorage() });

// Middlewares
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['https://hpl-public-form-bhaskar01.vercel.app', 'http://localhost:5173', 'http://localhost:5174'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Body: ${JSON.stringify(req.body)}`);
  next();
});
// Note: This is unnecessary since you're using Firebase Storage, not local uploads folder
app.use('/uploads', express.static('uploads'));
app.use('/images', express.static('public/images'));

// MongoDB Connection

const MONGO_URI = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@cluster0.wlpw7.mongodb.net/${process.env.MONGO_DB}?retryWrites=true&w=majority`;

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  });

// Socket.IO
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id, 'IP:', socket.handshake.address);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// Routes
app.use('/api/players', playerRoutes(upload, io));
app.use('/api/leaders', leaderRoutes(upload, io));
app.use('/api/teams', teamRoutes);
app.use('/api/soldplayers', soldPlayerRoutes);
app.use('/api', uploadRoutes); // ✅ Use Upload Routes

// Authentication Middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized' });
};

// Player Login
app.post('/api/players/login', async (req, res) => {
  const { mobileNo, password, name, dob } = req.body;

  try {
    let player;
    if (mobileNo && password) {
      player = await Player.findOne({ mobileNo, password });
    } else if (name && dob) {
      player = await Player.findOne({ name, dob });
    }

    if (!player) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    req.session.user = {
      id: player._id,
      role: 'player',
      mobileNo: player.mobileNo,
      name: player.name,
    };

    res.json({ message: 'Login successful', player: req.session.user });
  } catch (error) {
    console.error('Player login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Leader Login
app.post('/api/leaders/login', async (req, res) => {
  const { leaderMobileNo, password, teamName, leaderName } = req.body;

  try {
    let leader;
    if (leaderMobileNo && password) {
      leader = await Leader.findOne({ leaderMobileNo, password });
    } else if (teamName && leaderName) {
      leader = await Leader.findOne({ teamName, leaderName });
    }

    if (!leader) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    req.session.user = {
      id: leader._id,
      role: 'leader',
      leaderMobileNo: leader.leaderMobileNo,
      teamName: leader.teamName,
      leaderName: leader.leaderName,
    };

    res.json({ message: 'Login successful', leader: req.session.user });
  } catch (error) {
    console.error('Leader login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logout successful' });
  });
});

// Check Session
app.get('/api/check-session', (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ message: 'No active session' });
  }
});

// Protected Route Example
app.get('/api/protected', isAuthenticated, (req, res) => {
  res.json({ message: 'This is a protected route', user: req.session.user });
});

// PDF Generation Functions
const baseUrl = `http://localhost:${PORT}`;

const generatePlayerHTML = (playerData) => {
  const formattedDob = playerData.dob
    ? new Date(playerData.dob).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'N/A';

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Player Registration Form</title>
        <style>
* {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        margin: 0;
        width: 210mm;
        height: 297mm;
        font-family: Arial, sans-serif; /* Fallback font */
      }
      .full_container {
        width: 210mm; /* Fits within A4 with 10mm margins */
        height: 297mm; /* Fits within A4 with 10mm margins */
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .form-card {
        position: relative;
        width: 210mm; /* Full usable width */
        height: 297mm; /* Full usable height */
        background-color: #ffffff;
        color: #fff;
        display: grid;
        grid-template-rows: 40mm auto auto auto 1fr 50mm auto; /* Adjusted for A4 */
      }
      header {
        display: grid;
        grid-template-columns: 38mm 1fr 38mm; /* Adjusted for 190mm width */
        background: linear-gradient(
          to bottom,
          rgb(2, 1, 36) 20%,
          rgba(0, 0, 0, 0) 80%
        );
      }
      header .logo_top_left_corner,
      header .logo_top_right_corner {
        display: flex;
        justify-content: center;
        align-items: center;
      }
      header .logo_top_left_corner .image_div,
      header .logo_top_right_corner .image_div {
        height: 25mm; /* Reduced for A4 */
        width: 25mm;
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 50%;
      }
      header .logo_top_left_corner .image_div img,
      header .logo_top_right_corner .image_div img {
        width: 25mm;
        height: 25mm;
        filter: brightness(150%);
      }
      header .top_center_heading {
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        text-align: center;
      }
      .line {
        width: 100%;
      }
      section {
        display: grid;
        grid-template-rows: 40mm 1fr; /* Adjusted for A4 */
      }
      section .season_text_raw {
        display: grid;
        grid-template-columns: 57mm 1fr 57mm; /* Adjusted for 190mm width */
      }
      section .fields_text_raw {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        margin-top: 5mm;
      }
      section .season_text_raw .tournament_place,
      section .season_text_raw .tournament_timing_box {
        display: flex;
        align-items: start;
        padding-left: 10mm;
        font-size: 4.5mm;
        padding-top: 5.5mm;
        line-height: 6mm;
        color: #000;
        justify-content: start;
        flex-direction: column;
      }
      section .season_text_raw .main_season_text {
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        text-align: center;
      }
      .keyword_fields,
      .value_fields {
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .keyword_fields .text_box,
      .value_fields .text_box {
        height: 100%;
        color: #000;
        text-transform: capitalize;
        line-height: 10mm; /* Adjusted for spacing */
        width: 70%;
        font-size: 6mm;
      }
      .keyword_fields .text_box div,
      .value_fields .text_box div {
        line-height: 10mm; /* Adjusted for 'economically weaker section' */
      }
      .photo_field {
        display: flex;
        justify-content: center;
        align-items: start;
      }
      .photo_field .image_box {
        color: #000;
        width: 37mm;
        height: 42mm;
        margin-left: 5mm;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .photo_field .image_box img {
        width: 25mm;
        height: 25mm;
      }
      footer {
        display: flex;
        justify-content: center;
        align-items: start;
      }
      footer .text_box {
        font-family: "Times New Roman", Times, serif;
        border-top: 1mm solid red;
        height: 100%;
        width: 90%;
        color: #000;
        text-align: justify;
        padding-top: 4mm;
        font-size: 4mm;
      }
      .form-card .watermark {
        align-self: center;
        justify-self: center;
        border-radius: 50%;
        width: 120mm;
        height: 120mm;
        position: absolute;
        display: flex;
        justify-content: center;
        align-items: center;
        opacity: 0.26;
      }
      .form-card .watermark img {
        width: 130mm;
        height: 130mm;
      }
        </style>
      </head>
      <body>
        <div class="full_container">
          <div class="form-card">
            <header>
              <div class="logo_top_left_corner">
                <div class="image_div">
                  <img src="${baseUrl}/images/Logo.png" alt="logo" />
                </div>
              </div>
              <div class="top_center_heading">
                <h2 style="color: rgb(251, 255, 0); font-size: 18mm; font-family: Algerian;">HPL</h2>
                <p style="color: crimson; font-size: 6.5mm; font-weight: bold"><u>AUCTION & TOURNAMENT</u> <span style="color: crimson; font-size: 3mm">(NEXT LEVEL++)</span></p>
                <p style="color: rgb(0, 0, 0); font-size: 5mm">(HARIANDAB PREMIER LEAGUE)</p>
              </div>
              <div class="logo_top_right_corner">
                <div class="image_div">
                  <img src="${baseUrl}/images/Logo.png" alt="logo" />
                </div>
              </div>
            </header>
            <div class="line" style="height: 1mm; background-color: red"></div>
            <div class="line" style="height: 0.8mm; background-color: rgb(255, 255, 255)"></div>
            <div class="line" style="height: 0.2mm; background-color: red"></div>
            <section class="hero_section">
              <div class="season_text_raw">
                <div class="tournament_place">
                  <p>place: Hariandab</p>
                  <p>Navoday Vidyalaya</p>
                  <p>Date: 13/02/2025</p>
                </div>
                <div class="main_season_text">
                  <h1 style="color: #000; font-family: Algerian; letter-spacing: 0.25mm; font-size: 15mm;">SEASON-2</h1>
                  <p style="background-color: blue; color: #fff; text-transform: capitalize; font-weight: bold; padding: 2mm 3mm; font-size: 5.5mm;">-Player Registration form-</p>
                </div>
                <div class="tournament_timing_box">
                  <p>HPL committee</p>
                  <p>Nayan Das</p>
                  <p>Ankur Das</p>
                </div>
              </div>
              <div class="fields_text_raw">
                <div class="keyword_fields">
                  <div class="text_box">
                    <p>Player name</p>
                    <p>village name</p>
                    <p>date of birth</p>
                    <p>age</p>
                    <p>mobile No</p>
                    <p>category</p>
                    <p>batting style</p>
                    <p>bowling style</p>
                    <div><p>economically weaker</p><p>section</p></div>
                  </div>
                </div>
                <div class="value_fields">
                  <div class="text_box">
                    <p>${playerData.name || 'N/A'}</p>
                    <p>${playerData.village || 'N/A'}</p>
                    <p>${formattedDob}</p>
                    <p>${playerData.age || 'N/A'}</p>
                    <p>${playerData.mobileNo || 'N/A'}</p>
                    <p>${playerData.category || 'N/A'}</p>
                    <p>${playerData.battingStyle || 'N/A'}</p>
                    <p>${playerData.bowlingStyle || 'N/A'}</p>
                    <p>${playerData.economicallyWeaker || 'No'}</p>
                  </div>
                </div>
                <div class="photo_field">
                  <div class="image_box">
                    ${
                      // Note: If profilePhoto is a Firebase URL, ${baseUrl}/ prefix will break the image
                      playerData.profilePhoto
                        ? `<img src="${baseUrl}/${playerData.profilePhoto}" alt="player profile image" />`
                        : `<img src="${baseUrl}/images/default_profile.jpg" alt="player profile image" />`
                    }
                  </div>
                </div>
              </div>
            </section>
            <footer>
              <div class="text_box">
                Get ready for the thrill! The much-awaited HPL Tournament is set to take place on January 27, 2025, at exactly 5:30 PM. Mark your calendars! But before the action begins, the grand Tournament Auction will be held on January 20, 2025. We invite all players to be a part of this electrifying journey as we take HPL to the <span style="text-transform: capitalize; color: red">Next Level++</span>. See you on the field! Thank you!
              </div>
            </footer>
            <div class="watermark">
              <img src="${baseUrl}/images/Logo.png" alt="watermark image" />
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};

const generateLeaderHTML = (leaderData) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Leader Registration Form</title>
        <style>
 * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            margin: 0;
            width: 210mm;
            height: 297mm;
            font-family: Arial, sans-serif;
          }
          .full_container {
            width: 210mm;
            height: 297mm;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .form-card {
            position: relative;
            width: 210mm;
            height: 297mm;
            background-color: #ffffff;
            color: #fff;
            display: grid;
            grid-template-rows: 40mm auto auto auto 1fr 50mm auto;
          }
          header {
            display: grid;
            grid-template-columns: 38mm 1fr 38mm;
            background: linear-gradient(to bottom, rgb(148, 13, 3) -10%, rgba(0, 0, 0, 0) 90%);
          }
          header .logo_top_left_corner,
          header .logo_top_right_corner {
            display: flex;
            justify-content: center;
            align-items: center;
          }
          header .logo_top_left_corner .image_div,
          header .logo_top_right_corner .image_div {
            height: 25mm;
            width: 25mm;
            display: flex;
            justify-content: center;
            align-items: center;
            border-radius: 50%;
          }
          header .logo_top_left_corner .image_div img,
          header .logo_top_right_corner .image_div img {
            width: 25mm;
            height: 25mm;
            filter: brightness(150%);
          }
          header .top_center_heading {
            display: flex;
            justify-content: center;
            align-items: center;
            flex-direction: column;
            text-align: center;
          }
          .line {
            width: 100%;
          }
          section {
            display: grid;
            grid-template-rows: 40mm 1fr;
          }
          section .season_text_raw {
            display: grid;
            grid-template-columns: 57mm 1fr 57mm;
          }
          section .fields_text_raw {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            margin-top: 5mm;
          }
          section .season_text_raw .tournament_place,
          section .season_text_raw .tournament_timing_box {
            display: flex;
            align-items: start;
            padding-left: 10mm;
            font-size: 4.5mm;
            padding-top: 5.5mm;
            line-height: 6mm;
            color: #000;
            justify-content: start;
            flex-direction: column;
          }
          section .season_text_raw .main_season_text {
            display: flex;
            justify-content: center;
            align-items: center;
            flex-direction: column;
            text-align: center;
          }
          .keyword_fields,
          .value_fields {
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .keyword_fields .text_box,
          .value_fields .text_box {
            height: 100%;
            color: #000;
            text-transform: capitalize;
            line-height: 10mm;
            width: 70%;
            font-size: 6mm;
          }
          .keyword_fields .text_box div,
          .value_fields .text_box div {
            line-height: 10mm;
          }
          .photo_field {
            display: flex;
            justify-content: center;
            align-items: start;
          }
          .photo_field .image_box {
            color: #000;
            width: 35mm; /* Increased from 25mm */
            height: 40mm; /* Increased from 30mm */
            margin-left: 5mm;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .photo_field .image_box img {
            width: 35mm; /* Increased from 25mm */
            height: 35mm; /* Increased from 25mm */
            object-fit: cover; /* Ensures image scales properly */
          }
          footer {
            display: flex;
            justify-content: center;
            align-items: start;
          }
          footer .text_box {
            font-family: "Times New Roman", Times, serif;
            border-top: 1mm solid red;
            height: 100%;
            width: 90%;
            color: #000;
            text-align: justify;
            padding-top: 4mm;
            font-size: 4mm;
          }
          .form-card .watermark {
            align-self: center;
            justify-self: center;
            border-radius: 50%;
            width: 120mm;
            height: 120mm;
            position: absolute;
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0.26;
          }
          .form-card .watermark img {
            width: 130mm;
            height: 130mm;
          }
        </style>
      </head>
      <body>
        <div class="full_container">
          <div class="form-card">
            <header>
              <div class="logo_top_left_corner">
                <div class="image_div">
                  <img src="${baseUrl}/images/Logo.png" alt="logo" />
                </div>
              </div>
              <div class="top_center_heading">
                <h2 style="color: rgb(251, 255, 0); font-size: 18mm; font-family: Algerian;">HPL</h2>
                <p style="color: crimson; font-size: 6.5mm; font-weight: bold"><u>AUCTION & TOURNAMENT</u> <span style="color: crimson; font-size: 3mm">(NEXT LEVEL++)</span></p>
                <p style="color: rgb(0, 0, 0); font-size: 5mm">(HARIANDAB PREMIER LEAGUE)</p>
              </div>
              <div class="logo_top_right_corner">
                <div class="image_div">
                  <img src="${baseUrl}/images/Logo.png" alt="logo" />
                </div>
              </div>
            </header>
            <div class="line" style="height: 1mm; background-color: red"></div>
            <div class="line" style="height: 0.8mm; background-color: rgb(255, 255, 255)"></div>
            <div class="line" style="height: 0.2mm; background-color: red"></div>
            <section class="hero_section">
              <div class="season_text_raw">
                <div class="tournament_place">
                  <p>place: Hariandab</p>
                  <p>Navoday Vidyalaya</p>
                  <p>Date: 13/02/2025</p>
                </div>
                <div class="main_season_text">
                  <h1 style="color: #000; font-family: Algerian; letter-spacing: 0.25mm; font-size: 15mm;">SEASON-2</h1>
                  <p style="background-color: rgb(255, 0, 0); color: #fff; text-transform: capitalize; font-weight: bold; padding: 2mm 3mm; font-size: 5.5mm;">-Leader Registration form-</p>
                </div>
                <div class="tournament_timing_box">
                  <p>HPL committee</p>
                  <p>Nayan Das</p>
                  <p>Ankur Das</p>
                </div>
              </div>
              <div class="fields_text_raw">
                <div class="keyword_fields" style="font-size:4.2mm">
                  <div class="text_box">
                    <p>team name</p>
                    <p>leader name</p>
                    <p>village</p>
                    <p>leader mob. No</p>
                    <p>icon player name</p>
                    <p>icon player mob. No</p>
                  </div>
                </div>
                <div class="value_fields">
                  <div class="text_box">
                    <p>${leaderData.teamName || 'N/A'}</p>
                    <p>${leaderData.leaderName || 'N/A'}</p>
                    <p>${leaderData.village || 'N/A'}</p>
                    <p>${leaderData.leaderMobileNo || 'N/A'}</p>
                    <p>${leaderData.iconPlayerName || 'N/A'}</p>
                    <p>${leaderData.iconPlayerMobileNo || 'N/A'}</p>
                  </div>
                </div>
                <div class="photo_field">
                  <div class="image_box">
                    ${
                      // Note: If teamLogo is a Firebase URL, ${baseUrl}/ prefix will break the image
                      leaderData.teamLogo
                        ? `<img src="${baseUrl}/${leaderData.teamLogo}" alt="team logo image" />`
                        : `<img src="${baseUrl}/images/default_profile.jpg" alt="team logo image" />`
                    }
                  </div>
                </div>
              </div>
            </section>
            <footer>
              <div class="text_box">
                Get ready for the thrill! The much-awaited HPL Tournament is set to take place on January 27, 2025, at exactly 5:30 PM. Mark your calendars! But before the action begins, the grand Tournament Auction will be held on January 20, 2025. We invite all players to be a part of this electrifying journey as we take HPL to the <span style="text-transform: capitalize; color: red">Next Level++</span>. See you on the field! Thank you!
              </div>
            </footer>
            <div class="watermark">
              <img src="${baseUrl}/images/Logo.png" alt="watermark image" />
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};

const generatePDF = async (htmlContent, filename) => {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    await browser.close();
    return pdfBuffer;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF');
  }
};

// PDF Endpoints
app.post('/api/generate-player-pdf', async (req, res) => {
  try {
    const playerData = req.body;
    if (!playerData.name || playerData.name.trim() === '') {
      return res.status(400).json({ message: 'Player name is required for PDF generation' });
    }

    const sanitizedFileName = playerData.name.replace(/[^a-zA-Z0-9]/g, '_');
    const htmlContent = generatePlayerHTML(playerData);
    const pdfBuffer = await generatePDF(htmlContent, sanitizedFileName);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}_HPL_Registration.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer, 'binary');
  } catch (error) {
    res.status(500).json({ message: 'Error generating PDF', error: error.message });
  }
});

app.post('/api/generate-leader-pdf', async (req, res) => {
  try {
    const leaderData = req.body;
    if (!leaderData.teamName || leaderData.teamName.trim() === '') {
      return res.status(400).json({ message: 'Team name is required for PDF generation' });
    }

    const sanitizedFileName = leaderData.teamName.replace(/[^a-zA-Z0-9]/g, '_');
    const htmlContent = generateLeaderHTML(leaderData);
    const pdfBuffer = await generatePDF(htmlContent, sanitizedFileName);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}_HPL_Registration.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer, 'binary');
  } catch (error) {
    res.status(500).json({ message: 'Error generating PDF', error: error.message });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Global error:', err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});


app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});


app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});
