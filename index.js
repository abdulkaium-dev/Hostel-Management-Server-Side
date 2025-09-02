
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const Stripe = require('stripe');
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-admin-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const app = express();
const PORT = process.env.PORT || 5000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Middleware
// ✅ Auth Middleware (Firebase JWT Verify)
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: Token Missing" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);  // Verify token
    req.user = decoded;
    next();  // Proceed to the route handler
  } catch (err) {
    console.error("JWT Verify Error:", err);
    res.status(403).json({ message: "Invalid or expired token" });
  }
};




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
    // await client.connect();
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
     app.get("/", (req, res) => {
      res.send("✅ Server is running");
    });
   
   
   
const fetchMeal = async () => {
  setLoading(true);
  const token = localStorage.getItem("auth_token");

  if (!token) {
    Swal.fire("Error", "No authorization token found. Please log in again.", "error");
    setLoading(false);
    return;
  }

  try {
    const { data } = await axiosInstance.get(`/meals/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`, // Add token to request header
      },
    });
    setMeal(data);
    setLikeCount(data.likes || 0);
    setLiked(user?.email && data.likedBy?.includes(user.email));
  } catch (error) {
    Swal.fire("Error", "Failed to fetch meal details.", "error");
  } finally {
    setLoading(false);
  }
};


    // Get meal details
    app.get("/meals/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });

        const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });
        if (!meal) return res.status(404).json({ message: "Meal not found" });

        res.json(meal);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
      }
    });
 

    // Get reviews for a meal
    app.get("/reviews/:mealId", async (req, res) => {
      const { mealId } = req.params;

      if (!ObjectId.isValid(mealId)) {
        return res.status(400).json({ message: "Invalid meal ID" });
      }

      try {
        const reviews = await reviewsCollection
          .find({ mealId: new ObjectId(mealId) })
          .sort({ createdAt: -1 })
          .toArray();

        res.json(reviews);
      } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).json({ message: "Failed to fetch reviews" });
      }
    });

    // --- User Routes ---

    // Get user info by email
// Get user by email
app.get('/users/:email', async (req, res) => {
  const { email } = req.params;

  // Validate email
  if (!email) {
    return res.status(400).json({ message: 'Email parameter is required' });
  }

  try {
    // Fetch user and exclude sensitive fields like password
    const user = await usersCollection.findOne(
      { email },
      { projection: { password: 0 } } 
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return user data
    res.status(200).json(user);
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// Dashboard stats route
app.get("/dashboard/overview-stats", authMiddleware, async (req, res) => {
  try {
    const totalUsers = await usersCollection.countDocuments();
    const totalMeals = await mealsCollection.countDocuments();
    const totalRequests = await mealRequestsCollection.countDocuments();
    const totalReviews = await reviewsCollection.countDocuments();

    const mealLikes = await mealsCollection
      .find({}, { projection: { title: 1, likes: 1 } })
      .sort({ likes: -1 })
      .limit(5)
      .toArray();

    res.json({ totalUsers, totalMeals, totalRequests, totalReviews, mealLikes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
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

    const pageNumber = Math.max(parseInt(page, 10), 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10), 1), 50);
    const skip = (pageNumber - 1) * limitNumber;

    const query = {};
    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [{ username: regex }, { email: regex }];
    }

    const totalCount = await usersCollection.countDocuments(query);
    const users = await usersCollection
      .find(query)
      .skip(skip)
      .limit(limitNumber)
      .toArray();

    res.json({
      totalCount,
      totalPages: Math.ceil(totalCount / limitNumber),
      currentPage: pageNumber,
      users,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /users/:id/make-admin - Promote user to admin by ID
app.patch('/users/:id/make-admin',async (req, res) => {
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
    const { 
      search = '', 
      category, 
      minPrice, 
      maxPrice, 
      page = 1, 
      limit = 6, 
      sortByPrice 
    } = req.query;

    const query = {};

    // Search filter
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    // Category filter
    if (category && category !== 'All') query.category = category;

    // Price filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // Pagination
    const pageNumber = Math.max(parseInt(page, 10), 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10), 1), 50);
    const skip = (pageNumber - 1) * limitNumber;

    // Sorting
    let sort = {};
    if (sortByPrice === 'asc') sort = { price: 1 };
    else if (sortByPrice === 'desc') sort = { price: -1 };

    // Get total count for pagination
    const total = await mealsCollection.countDocuments(query);

    // Fetch meals
    const meals = await mealsCollection
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNumber)
      .toArray();

    res.json({ total, page: pageNumber, meals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});



        // Get meal by ID
   app.get("/meals/:id",async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });

  const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });
  if (!meal) return res.status(404).json({ message: "Meal not found" });

  res.json(meal);
});

// Firebase Authentication - Generate token on successful login/register
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await admin.auth().getUserByEmail(email);
    const token = await admin.auth().createCustomToken(user.uid);  // Create JWT token
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Error generating token" });
  }
});

    // ✅ Add a new meal (Admin only)
app.post('/meals',async (req, res) => {
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
// Pagination, sorting, and filtering for meals list
app.get('/all-meals', async (req, res) => {
  try {
    const {
      sortBy = 'likes',
      order = 'desc',
      page = '1',
      limit = '10',
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10), 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10), 1), 50); // limit max 50 for safety
    const skip = (pageNumber - 1) * limitNumber;

    // Allowed sorting fields for safety
    const allowedSortFields = ['likes', 'reviewCount', 'rating'];
    if (!allowedSortFields.includes(sortBy)) {
      return res.status(400).json({ message: 'Invalid sort field' });
    }

    const sortOrder = order === 'asc' ? 1 : -1;
    const sortCriteria = { [sortBy]: sortOrder };

    // Count total documents (without filters)
    const total = await mealsCollection.countDocuments();

    // Fetch paginated & sorted meals
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

    res.json({
      total,
      page: pageNumber,
      limit: limitNumber,
      meals,
    });
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
app.get('/serve-meals',async (req, res) => {
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
app.get('/serve-meals', async (req, res) => {
  try {
    const { search = '', page = '1', limit = '10' } = req.query;
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    // Build search query for userName or userEmail (case-insensitive)
    const query = {};
    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [{ userName: regex }, { userEmail: regex }];
    }

    // Count total matching documents
    const total = await mealRequestsCollection.countDocuments(query);

    // Get paginated meal requests sorted by newest first
    const requests = await mealRequestsCollection
      .find(query)
      .sort({ _id: -1 }) // newest first
      .skip(skip)
      .limit(limitNumber)
      .toArray();

    res.json({ requests, total });
  } catch (error) {
    console.error('GET /serve-meals error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


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
// Assuming Express and MongoDB setup and authMiddleware is ready

app.get('/requested-meals/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    const { page = '1', limit = '10' } = req.query;

    const pageNumber = Math.max(parseInt(page, 10), 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10), 1), 50);
    const skip = (pageNumber - 1) * limitNumber;

    // Total count of meal requests for the user
    const totalCount = await mealRequestsCollection.countDocuments({ userEmail });

    // Aggregation pipeline with pagination
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
      { $sort: { requestedAt: -1 } },
      { $skip: skip },
      { $limit: limitNumber },
    ]).toArray();

    res.json({
      requests,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNumber),
      currentPage: pageNumber,
    });
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
    // Read pagination params with default values
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // To get total count of reviews for pagination metadata
    const totalReviews = await reviewsCollection.countDocuments();

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
      { $skip: skip },
      { $limit: limit },
    ]).toArray();

    res.json({
      totalItems: totalReviews,
      totalPages: Math.ceil(totalReviews / limit),
      currentPage: page,
      reviews,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});



    // Get reviews for a meal
  // Example server-side route in Express
app.get("/reviews/:mealId", async (req, res) => {
  const { mealId } = req.params;

  if (!ObjectId.isValid(mealId)) {
    return res.status(400).json({ message: "Invalid meal ID" });
  }

  try {
    const reviews = await reviewsCollection
      .find({ mealId: new ObjectId(mealId) })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(reviews);
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ message: "Failed to fetch reviews" });
  }
});

    // Get reviews by user (with meal info and mealId)
app.get('/my-reviews/:userEmail', authMiddleware, async (req, res) => {
  try {
    const { userEmail } = req.params;
    const { page = '1', limit = '10' } = req.query;

    const pageNumber = Math.max(parseInt(page, 10), 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10), 1), 50);
    const skip = (pageNumber - 1) * limitNumber;

    const totalCount = await reviewsCollection.countDocuments({ userEmail });

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
          mealId: '$mealDetails._id',
          mealTitle: '$mealDetails.title',
          likes: '$mealDetails.likes',
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limitNumber },
    ]).toArray();

    res.json({
      reviews,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNumber),
      currentPage: pageNumber,
    });
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


// // POST: Publish upcoming meal (move to main mealsCollection)
// ==============================
app.post('/upcoming-meals/publish', async (req, res) => {
  try {
    const { mealId, addedByEmail } = req.body;

    if (!ObjectId.isValid(mealId)) 
      return res.status(400).json({ message: 'Invalid meal ID' });

    const upcomingMeal = await upcomingMealsCollection.findOne({ _id: new ObjectId(mealId) });
    if (!upcomingMeal) 
      return res.status(404).json({ message: 'Upcoming meal not found' });

    // Enforce minimum likes requirement before publishing
    const MIN_LIKES_TO_PUBLISH = 10;
    if ((upcomingMeal.likes || 0) < MIN_LIKES_TO_PUBLISH) {
      return res.status(400).json({ message: `Cannot publish. Minimum ${MIN_LIKES_TO_PUBLISH} likes required.` });
    }

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
