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
    console.log('✅ Connected to MongoDB');

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

    // --- User Routes ---

    // Get user info by email
    app.get('/users/:email', async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.params.email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });
      

   // ✅ Admin check route
app.get("/api/users/admin/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const user = await usersCollection.findOne({ email });
    res.send({ isAdmin: user?.role === "admin" });
  } catch (err) {
    console.error("Failed to check admin status:", err);
    res.status(500).json({ message: "Server error" });
  }
});


    // My Profile route (limited info)
    app.get('/my-profile/:email', async (req, res) => {
      try {
        const user = await usersCollection.findOne(
          { email: req.params.email },
          { projection: { displayName: 1, photoURL: 1, email: 1, badge: 1 } }
        );
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({
          name: user.displayName || '',
          image: user.photoURL || '',
          email: user.email,
          badge: user.badge || 'Bronze',
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // --- Meals Routes ---

    // Get meals with search, filter, pagination
    app.get('/meals', async (req, res) => {
      try {
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

        res.json({ total, page: parseInt(page), meals });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Get meal by ID
    app.get('/meals/:id', async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid ID' });

        const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });
        if (!meal) return res.status(404).json({ message: 'Meal not found' });

        res.json(meal);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Like a meal (only once per user)
    app.patch('/meals/:id/like', async (req, res) => {
      try {
        const { id } = req.params;
        const { userEmail } = req.body;

        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid ID' });
        if (!userEmail) return res.status(400).json({ message: 'User email required' });

        const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });
        if (!meal) return res.status(404).json({ message: 'Meal not found' });

        if (meal.likedBy?.includes(userEmail)) {
          return res.status(400).json({ message: 'Already liked' });
        }

        await mealsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { likes: 1 }, $addToSet: { likedBy: userEmail } }
        );

        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // --- Meal Requests Routes ---

       // Request a meal
    app.post('/meal-requests', async (req, res) => {
      try {
        const { mealId, userEmail, userName } = req.body;
        if (!mealId || !userEmail || !userName)
          return res.status(400).json({ message: 'Missing fields' });

        const exists = await mealRequestsCollection.findOne({
          mealId: new ObjectId(mealId),
          userEmail,
        });
        if (exists) return res.status(400).json({ message: 'Already requested this meal' });

        const result = await mealRequestsCollection.insertOne({
          mealId: new ObjectId(mealId),
          userEmail,
          userName,
          status: 'pending',
          requestedAt: new Date(),
        });

        res.json({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

     // Delete (cancel) a meal request
    app.delete('/meal-requests/:id', async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid ID' });

        const result = await mealRequestsCollection.deleteOne({ _id: new ObjectId(id) });
        if (!result.deletedCount) return res.status(404).json({ message: 'Not found' });

        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

     // Get all requested meals for a user with meal details
    app.get('/requested-meals/:userEmail', async (req, res) => {
      try {
        const requests = await mealRequestsCollection
          .aggregate([
            { $match: { userEmail: req.params.userEmail } },
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
                status: 1,
                requestedAt: 1,
                mealTitle: '$mealDetails.title',
                likes: '$mealDetails.likes',
                reviewCount: '$mealDetails.reviewCount',
              },
            },
            { $sort: { requestedAt: -1 } },
          ])
          .toArray();

        res.json(requests);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // --- Reviews Routes ---

    // Post a review
    app.post('/reviews', async (req, res) => {
      try {
        const { mealId, userEmail, userName, comment } = req.body;
        if (!mealId || !userEmail || !userName || !comment)
          return res.status(400).json({ message: 'Missing fields' });

        await reviewsCollection.insertOne({
          mealId: new ObjectId(mealId),
          userEmail,
          userName,
          comment,
          createdAt: new Date(),
        });

        await mealsCollection.updateOne(
          { _id: new ObjectId(mealId) },
          { $inc: { reviewCount: 1 } }
        );

        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Get reviews for a meal
    app.get('/reviews/:mealId', async (req, res) => {
      try {
        const { mealId } = req.params;
        if (!ObjectId.isValid(mealId)) return res.status(400).json({ message: 'Invalid ID' });

        const reviews = await reviewsCollection
          .find({ mealId: new ObjectId(mealId) })
          .sort({ createdAt: -1 })
          .toArray();

        res.json(reviews);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Get reviews by user (with meal info and mealId)
    app.get('/my-reviews/:userEmail', async (req, res) => {
      try {
        const reviews = await reviewsCollection
          .aggregate([
            { $match: { userEmail: req.params.userEmail } },
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
                mealId: '$mealDetails._id',
                mealTitle: '$mealDetails.title',
                likes: '$mealDetails.likes',
              },
            },
            { $sort: { createdAt: -1 } },
          ])
          .toArray();

        res.json(reviews);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Delete a review by ID (with decrement reviewCount)
    app.delete('/reviews/:id', async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid ID' });

        const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });
        if (!review) return res.status(404).json({ message: 'Review not found' });

        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
        if (!result.deletedCount) return res.status(404).json({ message: 'Review not found' });

        await mealsCollection.updateOne(
          { _id: review.mealId },
          { $inc: { reviewCount: -1 } }
        );

        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // --- Edit Review Routes ---

    // Get review by ID (for Edit page)
    app.get('/reviews/:id', async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid ID' });

        const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });
        if (!review) return res.status(404).json({ message: 'Review not found' });

        res.json(review);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Update a review by ID (Edit review)
    app.put('/reviews/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { comment } = req.body;

        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid review ID' });
        if (!comment || comment.trim() === '') return res.status(400).json({ message: 'Comment cannot be empty' });

        const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });
        if (!review) return res.status(404).json({ message: 'Review not found' });

        const updateResult = await reviewsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { comment: comment.trim() } }
        );

        if (updateResult.modifiedCount === 0) {
          return res.status(400).json({ message: 'No changes made to the review' });
        }

        res.json({ success: true, message: 'Review updated successfully' });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // --- Upcoming Meals Routes ---

    // Get upcoming meals
    app.get('/upcoming-meals', async (req, res) => {
      try {
        const meals = await upcomingMealsCollection.find().sort({ publishDate: 1 }).toArray();
        res.json(meals);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Like upcoming meal (premium users only)
    app.patch('/upcoming-meals/:id/like', async (req, res) => {
      try {
        const { id } = req.params;
        const { userEmail } = req.body;

        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid ID' });
        if (!userEmail) return res.status(400).json({ message: 'User email required' });

        const user = await usersCollection.findOne({ email: userEmail });
        const premiumBadges = ['Silver', 'Gold', 'Platinum'];

        if (!user || !premiumBadges.includes(user.badge))
          return res.status(403).json({ message: 'Not premium' });

        const meal = await upcomingMealsCollection.findOne({ _id: new ObjectId(id) });
        if (!meal) return res.status(404).json({ message: 'Meal not found' });

        if (meal.likedBy?.includes(userEmail)) {
          return res.status(400).json({ message: 'Already liked' });
        }

        await upcomingMealsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { likes: 1 }, $addToSet: { likedBy: userEmail } }
        );

        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // --- Stripe Payment Routes ---

    // Create Stripe payment intent
    app.post('/create-payment-intent', async (req, res) => {
      try {
        const { amount, packageName, userEmail } = req.body;
        if (!amount || !packageName || !userEmail)
          return res.status(400).json({ message: 'Missing fields' });

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount),
          currency: 'usd',
          metadata: { packageName, userEmail },
        });

        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Stripe error' });
      }
    });

    // Save payment info & update user badge
    app.post('/payments/save', async (req, res) => {
      try {
        const { userEmail, packageName, paymentIntentId, amount, status, purchasedAt } = req.body;
        if (
          !userEmail ||
          !packageName ||
          !paymentIntentId ||
          !amount ||
          !status ||
          !purchasedAt
        ) {
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

        // Capitalize badge name and update user
        const badge = packageName.charAt(0).toUpperCase() + packageName.slice(1);
        await usersCollection.updateOne({ email: userEmail }, { $set: { badge } });

        res.json({ success: true, badge });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // --- NEW: Get payment history for a user ---
    app.get('/payments/:userEmail', async (req, res) => {
      try {
        const { userEmail } = req.params;
        if (!userEmail) return res.status(400).json({ message: 'User email required' });

        const payments = await paymentsCollection
          .find({ userEmail })
          .sort({ purchasedAt: -1 })
          .toArray();

        if (!payments.length) {
          return res.json({ message: 'No payment history found', payments: [] });
        }

        res.json({ payments });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
  }
}

startServer();
