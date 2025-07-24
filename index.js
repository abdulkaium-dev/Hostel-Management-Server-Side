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


    // ✅ PATCH: Update user badge manually (admin or system can use this)
app.patch('/users/:email/badge', async (req, res) => {
  const email = req.params.email;
  const { badge } = req.body;

  const allowedBadges = ['Bronze', 'Silver', 'Gold', 'Platinum'];
  if (!badge || !allowedBadges.includes(badge)) {
    return res.status(400).json({ message: 'Invalid or missing badge value' });
  }

  try {
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Optional: Only allow admin to change badges
    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Admin access required to update badge' });
    }

    const result = await usersCollection.updateOne(
      { email },
      { $set: { badge } }
    );

    res.json({ success: true, message: `Badge updated to ${badge}` });
  } catch (err) {
    console.error('Error updating badge:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


        // Upsert user on login/register
 // POST /users/upsert
app.post("/users/upsert", async (req, res) => {
  const { email, displayName, photoURL } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  const update = {
    $setOnInsert: { badge: "Bronze", role: "user" },
    $set: { displayName, photoURL },
  };

  await usersCollection.updateOne({ email }, update, { upsert: true });
  res.json({ success: true });
});



// GET /users?search=&page=1&limit=10
app.get('/users', async (req, res) => {
  try {
    const { search = '', page = '1', limit = '10' } = req.query;

    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const query = {};
    if (search) {
      const searchRegex = new RegExp(search, 'i'); // case-insensitive
      query.$or = [
        { displayName: { $regex: searchRegex } },
        { email: { $regex: searchRegex } },
      ];
    }

    const total = await usersCollection.countDocuments(query);
    const users = await usersCollection
      .find(query)
      .skip(skip)
      .limit(limitNumber)
      .project({ displayName: 1, email: 1, role: 1, badge: 1 })
      .toArray();

    res.json({
      users,
      total,
      page: pageNumber,
      limit: limitNumber,
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /users/:id/make-admin - Promote user to admin by ID
app.patch('/users/:id/make-admin', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role: 'admin' } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'User not found or already admin' });
    }

    res.json({ success: true, message: 'User promoted to admin' });
  } catch (err) {
    console.error('Error making user admin:', err);
    res.status(500).json({ message: 'Server error' });
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

    // ✅ Add a new meal (Admin only)
app.post('/meals', async (req, res) => {
  try {
    const {
      title,
      category,
      image,
      ingredients,
      description,
      price,
      postTime,
      distributorName,
      addedByEmail
    } = req.body;

    if (
      !title || !category || !image || !ingredients || !description ||
      !price || !postTime || !distributorName || !addedByEmail
    ) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Optional: check if the user is an admin
    const admin = await usersCollection.findOne({ email: addedByEmail });
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can add meals' });
    }

    const newMeal = {
      title,
      category,
      image,
      ingredients,
      description,
      price: parseFloat(price),
      postTime,
      distributorName,
      addedByEmail,
      likes: 0,
      reviewCount: 0,
      rating: 0,
      likedBy: [], // for tracking like-per-user
      createdAt: new Date()
    };

    const result = await mealsCollection.insertOne(newMeal);
    res.json({ success: true, insertedId: result.insertedId });
  } catch (err) {
    console.error('Error adding meal:', err);
    res.status(500).json({ message: 'Server error' });
  }
});



// GET /all-meals?sortBy=likes|reviewCount|rating&order=asc|desc&page=1&limit=10
app.get('/all-meals', async (req, res) => {
  try {
    const { 
      sortBy = 'likes', 
      order = 'desc', 
      page = '1', 
      limit = '10' 
    } = req.query;

    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const allowedSortFields = ['likes', 'reviewCount', 'rating'];
    if (!allowedSortFields.includes(sortBy)) {
      return res.status(400).json({ message: 'Invalid sort field' });
    }

    const sortOrder = order === 'asc' ? 1 : -1;
    const sortCriteria = {};
    sortCriteria[sortBy] = sortOrder;

    const total = await mealsCollection.countDocuments();

    const meals = await mealsCollection
      .find({})
      .sort(sortCriteria)
      .skip(skip)
      .limit(limitNumber)
      .project({
        title: 1,
        likes: 1,
        reviewCount: 1,
        rating: 1,
        distributorName: 1,
      })
      .toArray();

    res.json({ total, page: pageNumber, limit: limitNumber, meals });
  } catch (err) {
    console.error('Error fetching all meals:', err);
    res.status(500).json({ message: 'Server error' });
  }
});



// Helper function to check if the user is admin
const verifyAdmin = async (email) => {
  try {
    const user = await usersCollection.findOne({ email });
    return user?.role === 'admin';
  } catch (error) {
    console.error('Error verifying admin:', error);
    return false;
  }
};
// Update meal route (admin only)
app.put('/meals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      category,
      image,
      ingredients,
      description,
      price,
      postTime,
      distributorName,
      addedByEmail,
    } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid meal ID' });
    }

    // Check if user is admin
    if (!addedByEmail || !(await verifyAdmin(addedByEmail))) {
      return res.status(403).json({ message: 'Only admins can update meals' });
    }

    if (
      !title ||
      !category ||
      !image ||
      !ingredients ||
      !description ||
      !price ||
      !postTime ||
      !distributorName
    ) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const updateDoc = {
      $set: {
        title,
        category,
        image,
        ingredients,
        description,
        price: parseFloat(price),
        postTime,
        distributorName,
      },
    };

    const result = await mealsCollection.updateOne(
      { _id: new ObjectId(id) },
      updateDoc
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Meal not found' });
    }

    res.json({ success: true, message: 'Meal updated successfully' });
  } catch (err) {
    console.error('Error updating meal:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// DELETE Meal (Only for Admins)
app.delete('/meals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const adminEmail = req.headers['x-admin-email'];

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid meal ID' });
    }

    if (!adminEmail || !(await verifyAdmin(adminEmail))) {
      return res.status(403).json({ message: 'Only admins can delete meals' });
    }

    const result = await mealsCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Meal not found' });
    }

    res.json({ success: true, message: 'Meal deleted successfully' });
  } catch (err) {
    console.error('Error deleting meal:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// serve meals route for admins
app.get('/serve-meals', async (req, res) => {
  try {
    const { search = '', page = '1', limit = '10' } = req.query;
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const searchQuery = search
      ? {
          $or: [
            { userName: { $regex: search, $options: 'i' } },
            { userEmail: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    // Aggregate with meal details lookup
    const pipeline = [
      { $match: searchQuery },
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
          userName: 1,
          userEmail: 1,
          status: 1,
          mealTitle: '$mealDetails.title',
        },
      },
      { $skip: skip },
      { $limit: limitNumber },
    ];

    const requests = await mealRequestsCollection.aggregate(pipeline).toArray();

    const total = await mealRequestsCollection.countDocuments(searchQuery);

    res.json({ total, page: pageNumber, limit: limitNumber, requests });
  } catch (err) {
    console.error('Error fetching serve meals:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /serve-meals/:requestId/serve
app.put('/serve-meals/:requestId/serve', async (req, res) => {
  try {
    const { requestId } = req.params;
    if (!ObjectId.isValid(requestId)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    const result = await mealRequestsCollection.updateOne(
      { _id: new ObjectId(requestId) },
      { $set: { status: 'delivered' } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Meal request not found' });
    }

    res.json({ success: true, message: 'Meal request marked as delivered' });
  } catch (err) {
    console.error('Error updating meal request status:', err);
    res.status(500).json({ message: 'Server error' });
  }
});




   // ✅ Admin check route
    app.get('/api/users/admin/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        res.send({ isAdmin: user?.role === 'admin' });
      } catch (err) {
        console.error('Failed to check admin status:', err);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Get Admin Profile (by email)
app.get('/admin/profile/:email', async (req, res) => {
  try {
    const { email } = req.params;

    // Find admin user by email and confirm role is admin
    const adminUser = await usersCollection.findOne({ email, role: 'admin' });
    if (!adminUser) {
      return res.status(404).json({ message: 'Admin user not found' });
    }

    // Count meals added by this admin (assuming meals have addedByEmail field)
    const mealsAddedCount = await mealsCollection.countDocuments({ addedByEmail: email });

    res.json({
      name: adminUser.displayName || '',
      image: adminUser.photoURL || '',
      email: adminUser.email,
      mealsAddedCount,
    });
  } catch (err) {
    console.error('Error fetching admin profile:', err);
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
// ✅ POST: Create a new meal request
app.post('/meal-requests', async (req, res) => {
  try {
    const { mealId, userEmail, userName } = req.body;

    if (!mealId || !userEmail || !userName) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Fetch the user from the database by email
    const user = await usersCollection.findOne({ email: userEmail });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check badge: only allow users with Silver, Gold, or Platinum badge
    if (!user.badge || user.badge === 'Bronze') {
      return res.status(403).json({
        message: 'Only Silver, Gold, or Platinum users can request meals.',
      });
    }

    // Check if user has already requested this meal
    const existingRequest = await mealRequestsCollection.findOne({
      mealId: new ObjectId(mealId),
      userEmail,
    });

    if (existingRequest) {
      return res.status(400).json({ message: 'You have already requested this meal.' });
    }

    // Insert new meal request
    const result = await mealRequestsCollection.insertOne({
      mealId: new ObjectId(mealId),
      userEmail,
      userName,
      status: 'pending',
      requestedAt: new Date(),
    });

    res.json({ success: true, insertedId: result.insertedId });
  } catch (err) {
    console.error('Error creating meal request:', err);
    res.status(500).json({ message: 'Server error' });
  }
});



// ✅ Get all requested meals for a user with meal details
app.get('/requested-meals/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;

    const requests = await mealRequestsCollection.aggregate([
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
          mealTitle: '$mealDetails.title',
          likes: '$mealDetails.likes',
          reviewCount: '$mealDetails.reviewCount',
          status: 1,
          requestedAt: 1,
        },
      },
      { $sort: { requestedAt: -1 } }
    ]).toArray();

    res.json(requests);
  } catch (err) {
    console.error('Error fetching requested meals:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// ✅ Delete (cancel) a meal request
app.delete('/meal-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    const result = await mealRequestsCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Meal request not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting meal request:', err);
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
// get all reviews with meals details
    app.get('/all-reviews', async (req, res) => {
  try {
    const reviews = await reviewsCollection.aggregate([
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
          userEmail: 1,
          userName: 1,
          mealId: '$mealDetails._id',
          mealTitle: '$mealDetails.title',
          mealLikes: '$mealDetails.likes',
          mealReviewCount: '$mealDetails.reviewCount',
        },
      },
      { $sort: { createdAt: -1 } },
    ]).toArray();

    res.json(reviews);
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

// GET all upcoming meals (sorted by publishDate asc)
app.get('/upcoming-meals', async (req, res) => {
  try {
    const meals = await upcomingMealsCollection
      .find()
      .sort({ publishDate: 1 }) // Or use { likes: -1 } for likes sorting
      .toArray();
    res.json(meals);
  } catch (err) {
    console.error('GET /upcoming-meals error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==============================
// PATCH: Like a meal (premium only)
// ==============================
app.patch('/upcoming-meals/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.body;

    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid ID' });
    if (!userEmail) return res.status(400).json({ message: 'User email required' });

    const user = await usersCollection.findOne({ email: userEmail });
    const premiumBadges = ['Silver', 'Gold', 'Platinum'];

    if (!user || !premiumBadges.includes(user.badge)) {
      return res.status(403).json({ message: 'Only premium users can like meals' });
    }

    const meal = await upcomingMealsCollection.findOne({ _id: new ObjectId(id) });
    if (!meal) return res.status(404).json({ message: 'Meal not found' });

    if (meal.likedBy?.includes(userEmail)) {
      return res.status(400).json({ message: 'Already liked' });
    }

    await upcomingMealsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $inc: { likes: 1 },
        $addToSet: { likedBy: userEmail },
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /upcoming-meals/:id/like error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==============================
// POST: Add new upcoming meal
// ==============================
app.post('/upcoming-meals', async (req, res) => {
  try {
    const {
      title,
      category,
      image,
      ingredients,
      description,
      price,
      publishDate,
      distributorName,
    } = req.body;

    if (!title || !category || !image || !ingredients || !description || !price || !publishDate || !distributorName) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const newMeal = {
      title,
      category,
      image,
      ingredients,
      description,
      price: parseFloat(price),
      publishDate: new Date(publishDate),
      distributorName,
      likes: 0,
      likedBy: [],
      createdAt: new Date(),
    };

    const result = await upcomingMealsCollection.insertOne(newMeal);
    res.json({ success: true, insertedId: result.insertedId });
  } catch (err) {
    console.error('POST /upcoming-meals error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==============================
// POST: Publish upcoming meal (move to main mealsCollection)
// ==============================
app.post('/upcoming-meals/publish', async (req, res) => {
  try {
    const { mealId, addedByEmail } = req.body;

    if (!ObjectId.isValid(mealId)) return res.status(400).json({ message: 'Invalid meal ID' });

    const upcomingMeal = await upcomingMealsCollection.findOne({ _id: new ObjectId(mealId) });
    if (!upcomingMeal) return res.status(404).json({ message: 'Upcoming meal not found' });

    const mealToAdd = {
      title: upcomingMeal.title,
      category: upcomingMeal.category,
      image: upcomingMeal.image,
      ingredients: upcomingMeal.ingredients,
      description: upcomingMeal.description,
      price: upcomingMeal.price,
      postTime: new Date(),
      distributorName: upcomingMeal.distributorName,
      addedByEmail: addedByEmail || 'admin@example.com',
      likes: 0,
      reviewCount: 0,
      rating: 0,
      likedBy: [],
      createdAt: new Date(),
    };

    await mealsCollection.insertOne(mealToAdd);
    await upcomingMealsCollection.deleteOne({ _id: new ObjectId(mealId) });

    res.json({ success: true, message: 'Meal published successfully' });
  } catch (err) {
    console.error('POST /upcoming-meals/publish error:', err);
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
