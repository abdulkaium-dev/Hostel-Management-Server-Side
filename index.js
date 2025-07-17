const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 5000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Setup
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

    // Health check
    app.get('/', (req, res) => {
      res.send('✅ Server is running');
    });

    // *** NEW: Get user by email (for badge fetching) ***
    app.get('/users/:email', async (req, res) => {
      const { email } = req.params;
      try {
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });

    // ------------------- MEALS -------------------
    app.get('/meals', async (req, res) => {
      const { search = '', category, minPrice, maxPrice, page = 1, limit = 6 } = req.query;
      const query = {};

      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } },
        ];
      }

      if (category && category !== 'All') query.category = category;

      if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = parseFloat(minPrice);
        if (maxPrice) query.price.$lte = parseFloat(maxPrice);
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const total = await mealsCollection.countDocuments(query);
      const meals = await mealsCollection.find(query).skip(skip).limit(parseInt(limit)).toArray();

      res.send({ total, page: parseInt(page), meals });
    });

    app.get('/meals/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });
        if (!meal) return res.status(404).json({ message: 'Meal not found' });
        res.json(meal);
      } catch (err) {
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.patch('/meals/:id/like', async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid meal ID' });

      const result = await mealsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $inc: { likes: 1 } }
      );

      if (result.modifiedCount === 0) return res.status(404).json({ message: 'Meal not found' });
      res.send({ success: true });
    });

    // ------------------- MEAL REQUESTS -------------------
    app.post('/meal-requests', async (req, res) => {
      const { mealId, userEmail, userName } = req.body;
      if (!mealId || !userEmail || !userName) {
        return res.status(400).json({ message: 'Missing required fields' });
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
    });

    app.delete('/meal-requests/:id', async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid request ID' });

      const result = await mealRequestsCollection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) return res.status(404).json({ message: 'Request not found' });

      res.send({ success: true, message: 'Request cancelled' });
    });

    // ------------------- REVIEWS -------------------
    app.post('/reviews', async (req, res) => {
      const { mealId, userEmail, userName, comment } = req.body;
      if (!mealId || !userEmail || !userName || !comment) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      const review = {
        mealId: new ObjectId(mealId),
        userEmail,
        userName,
        comment,
        createdAt: new Date(),
      };

      const result = await reviewsCollection.insertOne(review);
      await mealsCollection.updateOne(
        { _id: new ObjectId(mealId) },
        { $inc: { reviewCount: 1 } }
      );

      res.send({ success: true, insertedId: result.insertedId });
    });

    app.get('/reviews/:mealId', async (req, res) => {
      const { mealId } = req.params;
      if (!ObjectId.isValid(mealId)) return res.status(400).json({ message: 'Invalid meal ID' });

      const reviews = await reviewsCollection
        .find({ mealId: new ObjectId(mealId) })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(reviews);
    });

    app.delete('/reviews/:id', async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid review ID' });

      const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) return res.status(404).json({ message: 'Review not found' });

      res.send({ success: true });
    });

    app.get('/my-reviews/:userEmail', async (req, res) => {
      const { userEmail } = req.params;

      const reviews = await reviewsCollection.aggregate([
        { $match: { userEmail } },
        {
          $lookup: {
            from: 'meals',
            localField: 'mealId',
            foreignField: '_id',
            as: 'mealDetails',
          },
        },
        { $unwind: '$mealDetails' },
        {
          $project: {
            _id: 1,
            comment: 1,
            createdAt: 1,
            mealTitle: '$mealDetails.title',
            likes: '$mealDetails.likes',
          },
        },
        { $sort: { createdAt: -1 } },
      ]).toArray();

      res.send(reviews);
    });

    // ------------------- UPCOMING MEALS -------------------
    app.get('/upcoming-meals', async (req, res) => {
      try {
        const meals = await upcomingMealsCollection
          .find()
          .sort({ publishDate: 1 })
          .toArray();
        res.send(meals);
      } catch (err) {
        console.error('Error fetching upcoming meals:', err);
        res.status(500).json({ message: 'Failed to fetch upcoming meals' });
      }
    });

    app.patch('/upcoming-meals/:id/like', async (req, res) => {
      const { id } = req.params;
      const { userEmail } = req.body;

      if (!ObjectId.isValid(id) || !userEmail) {
        return res.status(400).json({ message: 'Invalid meal ID or user email' });
      }

      try {
        const user = await usersCollection.findOne({ email: userEmail });

        // Validate user and premium badge
        const premiumBadges = ['Silver', 'Gold', 'Platinum'];
        if (!user || !premiumBadges.includes(user.badge)) {
          return res.status(403).json({ message: 'Only premium users can like meals' });
        }

        // Check if already liked
        const meal = await upcomingMealsCollection.findOne({ _id: new ObjectId(id) });
        if (!meal) {
          return res.status(404).json({ message: 'Meal not found' });
        }

        if (meal.likedBy?.includes(userEmail)) {
          return res.status(400).json({ message: 'You already liked this meal' });
        }

        // Update meal
        const result = await upcomingMealsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $inc: { likes: 1 },
            $addToSet: { likedBy: userEmail }, // avoids duplicates
          }
        );

        res.send({ success: true, message: 'Meal liked' });
      } catch (error) {
        console.error('Like error:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // ------------------- PAYMENTS -------------------
    app.post('/create-payment-intent', async (req, res) => {
      const { amount, packageName, userEmail } = req.body;
      if (!amount || !packageName || !userEmail) {
        return res.status(400).json({ message: 'Missing fields' });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount),
        currency: 'usd',
        metadata: { packageName, userEmail },
      });

      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.post('/payments/save', async (req, res) => {
      const { userEmail, packageName, paymentIntentId, amount, status, purchasedAt } = req.body;

      if (!userEmail || !packageName || !paymentIntentId || !amount || !status || !purchasedAt) {
        return res.status(400).json({ error: 'Missing payment info' });
      }

      await paymentsCollection.insertOne({
        userEmail,
        packageName,
        paymentIntentId,
        amount,
        status,
        purchasedAt: new Date(purchasedAt),
      });

      const badge = packageName.charAt(0).toUpperCase() + packageName.slice(1);
      await usersCollection.updateOne({ email: userEmail }, { $set: { badge } });

      res.send({ success: true, message: 'Payment recorded and badge updated' });
    });

    // ------------------- Start Server -------------------
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
  }
}

startServer();
