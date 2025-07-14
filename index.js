// server.js
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();


// Middleware
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7ky75a3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
   const db = client.db("hostelDB");

const usersCollection = db.collection("users");
const mealsCollection = db.collection("meals");
const reviewsCollection = db.collection("reviews");
const mealRequestsCollection = db.collection("mealRequests");
const paymentsCollection = db.collection("payments");
const upcomingMealsCollection = db.collection("upcomingMeals");

// ✅ Meals endpoint
    app.get('/meals', async (req, res) => {
      try {
        const meals = await mealsCollection.find().toArray();
        res.send(meals);
      } catch (error) {
        console.error("Failed to fetch meals:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/',(req,  res) =>{
    res.send("Data is being fatced from the server")
})



// Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
