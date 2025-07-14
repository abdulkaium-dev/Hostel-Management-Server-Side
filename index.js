const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
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
    const upcomingMealsCollection = db.collection('upcomingMeals');
    const mealRequestsCollection = db.collection('mealRequests');
    const reviewsCollection = db.collection('reviews');

    // Get meals with filters & pagination
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
        const meals = await mealsCollection.find(query).skip(skip).limit(parseInt(limit)).toArray();

        res.send({ total, page: parseInt(page), meals });
      } catch (error) {
        console.error('Failed to fetch meals:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // Get single meal by ID
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

    // Like a meal
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

    // Meal request
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

    // Post review
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

    // Get reviews for a meal
    app.get('/reviews/:mealId', async (req, res) => {
      try {
        const mealId = req.params.mealId;
        const reviews = await reviewsCollection.find({ mealId: new ObjectId(mealId) }).sort({ createdAt: -1 }).toArray();
        res.send(reviews);
      } catch (error) {
        console.error('Failed to get reviews:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // Upcoming Meals: Get All
    app.get('/upcoming-meals', async (req, res) => {
      try {
        const meals = await upcomingMealsCollection.find().toArray();
        res.send(meals);
      } catch (error) {
        console.error('Error fetching upcoming meals:', error);
        res.status(500).send({ message: 'Failed to fetch upcoming meals' });
      }
    });

    // Upcoming Meals: Like once per user
    app.patch('/upcoming-meals/like/:id', async (req, res) => {
      const mealId = req.params.id;
      const { email } = req.body;
      try {
        const meal = await upcomingMealsCollection.findOne({ _id: new ObjectId(mealId) });
        if (!meal) return res.status(404).send({ message: 'Meal not found' });

        if (meal.likedBy?.includes(email)) {
          return res.send({ success: false, message: 'Already liked this meal.' });
        }

        const result = await upcomingMealsCollection.updateOne(
          { _id: new ObjectId(mealId) },
          {
            $inc: { likes: 1 },
            $addToSet: { likedBy: email },
          }
        );

        res.send({ success: result.modifiedCount > 0 });
      } catch (err) {
        console.error('Error updating like:', err);
        res.status(500).send({ success: false, message: 'Internal Server Error' });
      }
    });

    // Health check
    app.get('/', (req, res) => {
      res.send('✅ Server is running.');
    });

    await client.db('admin').command({ ping: 1 });
    console.log('✅ MongoDB connected successfully!');
  } finally {
    // Keeping the connection alive
  }
}

run().catch(console.dir);

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
