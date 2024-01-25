const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/User.js");
const Place = require("./models/Place.js");
const Booking = require("./models/Booking.js");
const cookieParser = require("cookie-parser");
const imageDownloader = require("image-downloader");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multer = require("multer");
const fs = require("fs");
const mime = require("mime-types");

require("dotenv").config();
const app = express();

const bcryptSalt = bcrypt.genSaltSync(10);
const jwtSecret = "fasefraw4r5r3wq45wdfgw34twdfg";
const bucket = "dawid-booking-app";

app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(__dirname + "/uploads"));
app.use(
  cors({
    credentials: true,
    origin: process.env.FRONT_URL /* ,"http://127.0.0.1:5173" */,
    /*  "http://localhost:5173" */
  })
);

async function uploadToS3(path, originalFilename, mimetype) {
  const client = new S3Client({
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  const parts = originalFilename.split(".");
  const ext = parts[parts.length - 1];
  const newFilename = Date.now() + "." + ext;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Body: fs.readFileSync(path),
      Key: newFilename,
      ContentType: mimetype,
      ACL: "public-read",
    })
  );
  return `https://${bucket}.s3.amazonaws.com/${newFilename}`;
}

function getUserDataFromReq(req) {
  return new Promise((resolve, reject) => {
    jwt.verify(req.cookies.token, jwtSecret, {}, async (err, userData) => {
      if (err) throw err;
      resolve(userData);
    });
  });
}

app.get("/api/test", (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  res.json("test ok");
});

app.post("/api/register", async (req, res) => {
  /*  console.log("/api/register called");
  console.log("process.env.MONGO_URL: ", process.env.MONGO_URL); */
  mongoose
    .connect(process.env.MONGO_URL)
    .then(console.log("connected to db: " + process.env.MONGO_URL));
  const { name, email, password } = req.body;
  console.log(name, email, password);
  try {
    const userDoc = await User.create({
      name,
      email,
      password: bcrypt.hashSync(password, bcryptSalt),
    });
    jwt.sign(
      {
        email: userDoc.email,
        id: userDoc._id,
      },
      jwtSecret,
      {},
      (err, token) => {
        if (err) throw err;
        res.cookie("token", token).json(userDoc);
      }
    );
    // res.json(userDoc);
  } catch (e) {
    res.status(422).json(e);
  }
});

app.post("/api/login", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const { email, password } = req.body;
  console.log("from login: ", email, password);
  const userDoc = await User.findOne({ email });
  console.log("userDoc: ", userDoc);
  if (userDoc) {
    console.log("found ");
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign(
        {
          email: userDoc.email,
          id: userDoc._id,
        },
        jwtSecret,
        {},
        (err, token) => {
          if (err) throw err;
          res.cookie("token", token).json(userDoc);
        }
      );
    } else {
      res.status(422).json("pass not ok");
    }
  } else {
    console.log("not found ");
    res.status(422).json("not found");
  }
});

app.get("/api/profile", (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const { token } = req.cookies;
  if (token) {
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) throw err;
      const { name, email, _id } = await User.findById(userData.id);
      res.json({ name, email, _id });
    });
  } else {
    res.json(null);
  }
});

app.post("/api/logout", (req, res) => {
  res.cookie("token", "").json(true);
});

app.post("/api/upload-by-link", async (req, res) => {
  const { link } = req.body;
  const newName = "photo" + Date.now() + ".jpg";
  console.log("link: ", link);
  console.log("newName: ", newName);
  console.log("dest: ", __dirname + "/uploads/" + newName);
  await imageDownloader.image({
    url: link,
    // dest: "/tmp/" + newName,
    dest: __dirname + "/uploads/" + newName,
  });
  /*   const url = await uploadToS3(
    "/tmp/" + newName,
    newName,
    mime.lookup("/tmp/" + newName)
  ); */
  res.json(newName);
  // res.json(url);
});

//my
app.post("/api/upload-by-link-net", async (req, res) => {
  const { link } = req.body;
  const newName = "photo" + Date.now() + ".jpg";
  console.log("link: ", link);
  console.log("newName: ", newName);
  console.log("dest: ", __dirname + "/uploads/" + newName);
  //temporary uploading to fs doesn't work on vercel, I just store an original url
  /*   const file = await imageDownloader.image({
    url: link,
    // dest: "/tmp/" + newName,
    dest: __dirname + "/uploads/" + newName,
  });
  console.log("file: ", file);
  const uploadResult = await cloudinaryUpload(file.filename, newName);
  console.log("uploadResult: ", uploadResult); */
  /*   const url = await uploadToS3(
    "/tmp/" + newName,
    newName,
    mime.lookup("/tmp/" + newName)
  ); */
  //res.json(newName);//it works too
  res.json(link); //it works too
  //res.json(uploadResult.url);
  // res.json(url);
});

const photosMiddleware = multer({ dest: __dirname + "/uploads" });
app.post(
  "/api/upload",
  photosMiddleware.array("photos", 100),
  async (req, res) => {
    const uploadedFiles = [];
    console.log("req.files: ", req.files);
    for (let i = 0; i < req.files.length; i++) {
      const { path, originalname, filename, mimetype } = req.files[i];
      const parts = originalname.split(".");
      const ext = parts[parts.length - 1];
      const newPath = path + "." + ext;
      // fs.renameSync(path, newPath);
      fs.renameSync(path, __dirname + "/uploads/" + originalname); //my, local
      // const url = await uploadToS3(path, originalname, mimetype);
      // uploadedFiles.push(url);
      // uploadedFiles.push(filename + "." + ext);
      uploadedFiles.push(originalname); //my, local
    }
    res.json(uploadedFiles);
  }
);

//my addition of upload to cloudinary
require("dotenv").config();
const path = require("path");
const DatauriParser = require("datauri/parser");
const parser = new DatauriParser();

const formatBufferTo64 = (file) =>
  parser.format(path.extname(file.originalname).toString(), file.buffer);

const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
  secure: true,
});

const ALLOWED_FORMATS = ["image/jpeg", "image/png", "image/jpg"];
const storage = multer.memoryStorage();
const uploadToMemory = multer({
  storage,
  fileFilter: function (req, file, cb) {
    if (ALLOWED_FORMATS.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Not supported file type!"), false);
    }
  },
});

const cloudinaryUpload = (file, originalname) =>
  cloudinary.uploader.upload(file, {
    public_id:
      "CloudinaryDemo/" + Date.now() + "-" + Math.round(Math.random() * 1e6),
  });

app.post(
  "/api/upload-net",
  uploadToMemory.array("photos", 100),
  async (req, res) => {
    mongoose.connect(process.env.MONGO_URL); //for vercel
    const uploadedFiles = [];
    console.log("req.files: ", req.files);
    for (let i = 0; i < req.files.length; i++) {
      const { originalname } = req.files[i];

      /*       const { path, originalname, filename, mimetype } = req.files[i];
      const parts = originalname.split(".");
      const ext = parts[parts.length - 1];
      const newPath = path + "." + ext;
      // fs.renameSync(path, newPath);
      fs.renameSync(path, __dirname + "/uploads/" + originalname); //my, local
      // const url = await uploadToS3(path, originalname, mimetype);
      // uploadedFiles.push(url);
      // uploadedFiles.push(filename + "." + ext);
 */
      try {
        if (!req.files[i]) {
          throw new Error("Image is not presented!");
        }
        if (req.files[i].size > 1000000) {
          throw new Error("File size cannot be larger than 1MB!");
        }
        console.log("req.file:");
        console.log(req.files[i]);
        //console.log(req.file.size);
        //console.log(req.file.originalname);
        // console.log("file before:");
        // console.log(ALLOWED_FORMATS );
        const file64 = formatBufferTo64(req.files[i]);
        // console.log("file64 :");
        // console.log(file64.content);
        const uploadResult = await cloudinaryUpload(
          file64.content,
          req.files[i].originalname
        );
        console.log("uploadResult: ", uploadResult);
        uploadedFiles.push(uploadResult.url); //my, local
        //res.send('Done');
        // return res.json({cloudinaryId: uploadResult.public_id, url: uploadResult.secure_url});
        //  return res.status(200).send({ location: uploadResult.url });
        /*         res.status(200).send({
          message:
            "Uploaded the file successfully: <br>" +
            req.file.originalname +
            " <br> as <br>" +
            //req.file.filename,
            uploadResult.url,
        }); */
      } catch (e) {
        console.log("err:", e);
        // return res.status(422).send({ message: e.message });
      }
    }
    console.log("uploadedFiles: ", uploadedFiles);
    res.json(uploadedFiles);
  }
);

app.post("/api/places", (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const { token } = req.cookies;
  const {
    title,
    address,
    addedPhotos,
    description,
    price,
    perks,
    extraInfo,
    checkIn,
    checkOut,
    maxGuests,
  } = req.body;
  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if (err) throw err;
    const placeDoc = await Place.create({
      owner: userData.id,
      price,
      title,
      address,
      photos: addedPhotos,
      description,
      perks,
      extraInfo,
      checkIn,
      checkOut,
      maxGuests,
    });
    res.json(placeDoc);
  });
});

app.get("/api/user-places", (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const { token } = req.cookies;
  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    const { id } = userData;
    res.json(await Place.find({ owner: id }));
  });
});

app.get("/api/places/:id", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const { id } = req.params;
  res.json(await Place.findById(id));
});

app.put("/api/places", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const { token } = req.cookies;
  const {
    id,
    title,
    address,
    addedPhotos,
    description,
    perks,
    extraInfo,
    checkIn,
    checkOut,
    maxGuests,
    price,
  } = req.body;
  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if (err) throw err;
    const placeDoc = await Place.findById(id);
    if (userData.id === placeDoc.owner.toString()) {
      placeDoc.set({
        title,
        address,
        photos: addedPhotos,
        description,
        perks,
        extraInfo,
        checkIn,
        checkOut,
        maxGuests,
        price,
      });
      await placeDoc.save();
      res.json("ok");
    }
  });
});

app.get("/api/places", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  res.json(await Place.find());
});

app.post("/api/bookings", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const userData = await getUserDataFromReq(req);
  console.log("userData from bookings:", userData);
  console.log("req.body from bookings:", req.body);
  const { place, checkIn, checkOut, numberOfGuests, name, phone, price } =
    req.body;
  Booking.create({
    place,
    checkIn,
    checkOut,
    numberOfGuests,
    name,
    phone,
    price,
    user: userData.id,
  })
    .then((doc) => {
      res.json(doc);
    })
    .catch((err) => {
      throw err;
    });
});

app.get("/api/bookings", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const userData = await getUserDataFromReq(req);
  res.json(await Booking.find({ user: userData.id }).populate("place"));
});

app.listen(4000, (err) => {
  if (err) {
    return console.log(err);
  }
  console.log(`Server OK on localhost:${process.env.PORT || 4000}`);
});
