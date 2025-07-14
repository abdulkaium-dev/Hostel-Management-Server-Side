const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const PORT = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.use(cors());
app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7ky75a3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// MongoClient setup
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db('hostelDB');
    const mealsCollection = db.collection('meals');
    const mealRequestsCollection = db.collection('mealRequests');
    const reviewsCollection = db.collection('reviews');

    // 🔹 Get meals with filters & pagination
    app.get('/meals', async (req, res) => {
      try {
        const {
          search = '',
          category,
          minPrice,
          maxPrice,
          page = 1,
          limit = 6,
        } = req.query;

        const query = {};

        if (search) {
          query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { category: { $regex: search, $options: 'i' } },
          ];
        }

        if (category && category !== 'All') {
          query.category = category;
        }

        if (minPrice || maxPrice) {
          query.price = {};
          if (minPrice) query.price.$gte = parseFloat(minPrice);
          if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await mealsCollection.countDocuments(query);
        const meals = await mealsCollection
          .find(query)
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        res.send({
          total,
          page: parseInt(page),
          meals,
        });
      } catch (error) {
        console.error('Failed to fetch meals:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // 🔹 Get meal by ID
    app.get('/meals/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });
        if (!meal) return res.status(404).send({ message: 'Meal not found' });
        res.send(meal);
      } catch (error) {
        console.error('Failed to fetch meal:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // 🔹 Like a meal
    app.patch('/meals/:id/like', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await mealsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { likes: 1 } }
        );
        res.send(result);
      } catch (error) {
        console.error('Failed to like meal:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // 🔹 Request a meal
    app.post('/meal-requests', async (req, res) => {
      try {
        const { mealId, userEmail, userName } = req.body;

        if (!mealId || !userEmail || !userName) {
          return res.status(400).send({ message: 'Missing required fields' });
        }

        const doc = {
          mealId: new ObjectId(mealId),
          userEmail,
          userName,
          status: 'pending',
          requestedAt: new Date(),
        };

        const result = await mealRequestsCollection.insertOne(doc);
        res.send(result);
      } catch (error) {
        console.error('Failed to request meal:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // 🔹 Post a review
    app.post('/reviews', async (req, res) => {
      try {
        const { mealId, userEmail, userName, comment } = req.body;

        if (!mealId || !userEmail || !userName || !comment) {
          return res.status(400).send({ message: 'Missing required fields' });
        }

        const doc = {
          mealId: new ObjectId(mealId),
          userEmail,
          userName,
          comment,
          createdAt: new Date(),
        };

        const result = await reviewsCollection.insertOne(doc);
        res.send(result);
      } catch (error) {
        console.error('Failed to post review:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // 🔹 Get all reviews for a meal
    app.get('/reviews/:mealId', async (req, res) => {
      try {
        const mealId = req.params.mealId;
        const reviews = await reviewsCollection
          .find({ mealId: new ObjectId(mealId) })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(reviews);
      } catch (error) {
        console.error('Failed to get reviews:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // Root route
    app.get('/', (req, res) => {
      res.send('✅ Server is running.');
    });

    // Confirm DB connection
    await client.db('admin').command({ ping: 1 });
    console.log('✅ MongoDB connected successfully!');
  } finally {
    // Keeping MongoDB connection open
  }
}
run().catch(console.dir);

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
