const express = require("express");
const ObjectId = require("mongodb").ObjectId;
const admin = require("firebase-admin"); //firebase setup this line
const app = express();
const cors = require("cors");
require("dotenv").config();
const { MongoClient } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const fileUpload = require("express-fileupload");

const port = process.env.PORT || 5000;

// doctors-portal-d2d9a-firebase.json

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
// middle ware
app.use(cors());
app.use(express.json());
app.use(fileUpload());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.aubya.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// require setup jwt start
async function verifyToken(req, res, next) {
  if (req.headers?.authorization?.startsWith("Bearer ")) {
    const token = req.headers.authorization.split(" ")[1];
    try {
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
    } catch {}
  }
  next();
}
// require setup jwt end

async function run() {
  try {
    await client.connect();
    const database = client.db("doctors_portal");
    const appointmentCollection = database.collection("appointments");
    const usersCollection = database.collection("users");
    const doctorsCollection = database.collection("doctors");
    // insert a document post api
    app.post("/appointments", async (req, res) => {
      const body = req.body;
      const result = await appointmentCollection.insertOne(body);
      // console.log(result);
      res.send(result);
    });
    //get appointment payment
    app.get("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await appointmentCollection.findOne(filter);
      res.send(result);
    });
    //get appointment by email api
    app.get("/appointments", verifyToken, async (req, res) => {
      const email = req?.query?.email;
      const date = req.query.date;
      // console.log(email);
      const query = { email: email, date: date };
      const cursor = appointmentCollection.find(query);
      const result = await cursor.toArray();
      // console.log(result);
      res.send(result);
    });

    // check admin and get data api
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const filter = { email: email };
      const user = await usersCollection.findOne(filter);
      let isAdmin = false;
      if (user?.role === "admin") {
        isAdmin = true;
      }
      res.json({ admin: isAdmin });
    });
    // post api for email and name in db
    app.post("/users", async (req, res) => {
      const user = req.body;
      // console.log(users)
      const result = await usersCollection.insertOne(user);
      // console.log(result)
      res.send(result);
    });
    // upsert for googlesign in
    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: req.body.email };
      const options = { upsert: true };
      const updateDoc = { $set: user };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      // console.log(result);
      res.send(result);
    });
    // Add admin inDatabase
    app.put("/users/admin", verifyToken, async (req, res) => {
      const user = req.body;
      const requester = req.decodedEmail;
      if (requester) {
        const requesterAccount = await usersCollection.findOne({
          email: requester,
        });
        if (requesterAccount.role === "admin") {
          const filter = { email: user.email };
          const updateDoc = { $set: { role: "admin" } };
          const result = await usersCollection.updateOne(filter, updateDoc);
          res.json(result);
        } else {
          res
            .status(403)
            .json({ message: "you do not have access to make admin" });
        }
      }
    });
    // console.log(user);

    // payment related api stripe
    app.post("/create-payment-intent", async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    //update payment
    app.put("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = { $set: { payment: payment } };
      const result = await appointmentCollection.updateOne(filter, updateDoc);
      res.json(result);
    });
    //add doctor
    app.post("/doctors", async (req, res) => {
      const name = req.body.name;
      const email = req.body.email;
      const pic = req.files.image;
      const picData = pic.data;
      const encodedPic = picData.toString("base64");
      const imageBuffer = Buffer.from(encodedPic, "base64");
      const doctor = {
        name,
        email,
        image: imageBuffer,
      };
      const result = await doctorsCollection.insertOne(doctor)
      res.send(result);
    });

    // get doctor
   app.get('/doctors',async(req,res)=>{
     const result = await doctorsCollection.find({}).toArray()
     res.send(result);
   })


  } finally {
    //    await client.close()
  }
}
run().catch(console.dir);

//
app.get("/", (req, res) => {
  //  .
  res.send("hello doctors portal");
});
app.listen(port, () => {
  console.log("listening on port ", port);
});
