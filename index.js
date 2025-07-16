const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// MongoDB URI and Client
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7ky75a3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function startServer() {
  try {
    await client.connect();
    const db = client.db('hostelDB');

    // Collections
    const usersCollection = db.collection('users');
    const paymentsCollection = db.collection('payments');
    const mealsCollection = db.collection('meals');
    const upcomingMealsCollection = db.collection('upcomingMeals');
    const mealRequestsCollection = db.collection('mealRequests');
    const reviewsCollection = db.collection('reviews');

    console.log('✅ Connected to MongoDB');

    // Health Check Route
    app.get('/', (req, res) => {
      res.send('✅ Server is running');
    });

    // --- Meal routes ---

    // Get meals with optional filters, pagination
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
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: 'Invalid Meal ID format' });
        }

        const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });

        if (!meal) {
          return res.status(404).json({ message: 'Meal not found' });
        }

        res.json(meal);
      } catch (error) {
        console.error('Error fetching meal:', error);
        res.status(500).json({ message: 'Internal Server Error' });
      }
    });

    // Like a meal (increment likes)
    app.patch('/meals/:id/like', async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: 'Invalid Meal ID' });
        }
        const result = await mealsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { likes: 1 } }
        );
        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: 'Meal not found' });
        }
        res.send({ success: true });
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
        if (!ObjectId.isValid(mealId)) {
          return res.status(400).send({ message: 'Invalid Meal ID' });
        }
        const doc = {
          mealId: new ObjectId(mealId),
          userEmail,
          userName,
          status: 'pending',
          requestedAt: new Date(),
        };
        const result = await mealRequestsCollection.insertOne(doc);
        res.send({ success: true, insertedId: result.insertedId });
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
        if (!ObjectId.isValid(mealId)) {
          return res.status(400).send({ message: 'Invalid Meal ID' });
        }
        const doc = {
          mealId: new ObjectId(mealId),
          userEmail,
          userName,
          comment,
          createdAt: new Date(),
        };
        const result = await reviewsCollection.insertOne(doc);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error('Failed to post review:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // Get reviews for a meal
    app.get('/reviews/:mealId', async (req, res) => {
      try {
        const mealId = req.params.mealId;
        if (!ObjectId.isValid(mealId)) {
          return res.status(400).send({ message: 'Invalid Meal ID' });
        }
        const reviews = await reviewsCollection.find({ mealId: new ObjectId(mealId) }).sort({ createdAt: -1 }).toArray();
        res.send(reviews);
      } catch (error) {
        console.error('Failed to get reviews:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // Delete a review by review ID
    app.delete('/reviews/:id', async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: 'Invalid Review ID' });

        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).send({ message: 'Review not found' });

        res.send({ success: true, message: 'Review deleted successfully' });
      } catch (error) {
        console.error('Failed to delete review:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // Get all reviews by userEmail with meal info (My Reviews)
    app.get('/my-reviews/:userEmail', async (req, res) => {
      try {
        const userEmail = req.params.userEmail;

        const reviewsWithMeals = await reviewsCollection.aggregate([
          { $match: { userEmail } },
          {
            $lookup: {
              from: 'meals',
              localField: 'mealId',
              foreignField: '_id',
              as: 'mealDetails'
            }
          },
          { $unwind: '$mealDetails' },
          {
            $project: {
              _id: 1,
              comment: 1,
              createdAt: 1,
              mealId: 1,
              mealTitle: '$mealDetails.title',
              likes: '$mealDetails.likes'
            }
          },
          { $sort: { createdAt: -1 } }
        ]).toArray();

        res.json(reviewsWithMeals);
      } catch (error) {
        console.error('Failed to get user reviews:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // Upcoming Meals: Get all
    app.get('/upcoming-meals', async (req, res) => {
      try {
        const meals = await upcomingMealsCollection.find().toArray();
        res.send(meals);
      } catch (error) {
        console.error('Error fetching upcoming meals:', error);
        res.status(500).send({ message: 'Failed to fetch upcoming meals' });
      }
    });

    // Upcoming Meals: Like once per user (email in req.body)
    app.patch('/upcoming-meals/like/:id', async (req, res) => {
      try {
        const mealId = req.params.id;
        const { email } = req.body;
        if (!ObjectId.isValid(mealId)) {
          return res.status(400).send({ message: 'Invalid Meal ID' });
        }
        if (!email) {
          return res.status(400).send({ message: 'Missing user email' });
        }

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

    // --- Stripe Payment and User Badge Update ---

    // Create Payment Intent
    app.post('/create-payment-intent', async (req, res) => {
      const { amount, packageName, userEmail } = req.body;
      if (!amount || !packageName || !userEmail) {
        return res.status(400).send({ error: 'Missing required fields' });
      }

      try {
        // Stripe expects amount in cents as integer
        const amountInCents = Math.round(amount);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: 'usd',
          metadata: { packageName, userEmail },
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (err) {
        console.error('Stripe payment intent error:', err);
        res.status(500).send({ error: 'Failed to create payment intent' });
      }
    });

    // Save payment info and update user's badge
    app.post('/payments/save', async (req, res) => {
      const { userEmail, packageName, paymentIntentId, amount, status, purchasedAt } = req.body;

      if (!userEmail || !packageName || !paymentIntentId || !amount || !status || !purchasedAt) {
        return res.status(400).json({ error: 'Missing payment info' });
      }

      try {
        // Insert payment record
        await paymentsCollection.insertOne({
          userEmail,
          packageName,
          paymentIntentId,
          amount,
          status,
          purchasedAt: new Date(purchasedAt),
        });

        // Update user's badge in users collection
        const badgeName = packageName.charAt(0).toUpperCase() + packageName.slice(1);

        const updateResult = await usersCollection.updateOne(
          { email: userEmail },
          { $set: { badge: badgeName } }
        );

        if (updateResult.matchedCount === 0) {
          console.warn(`User not found with email: ${userEmail}`);
        }

        res.json({ success: true, message: 'Payment saved and user badge updated' });
      } catch (err) {
        console.error('Error saving payment info:', err);
        res.status(500).json({ error: 'Failed to save payment info' });
      }
    });

    // DELETE meal request by ID (cancel request)
    app.delete('/meal-requests/:id', async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: 'Invalid Request ID' });
        }

        const result = await mealRequestsCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
          return res.status(404).send({ message: 'Request not found' });
        }

        res.send({ success: true, message: 'Request cancelled successfully' });
      } catch (error) {
        console.error('Failed to delete meal request:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });

  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
  }
}

startServer();
