// server.js
const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const PORT = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7ky75a3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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

    app.get('/', (req, res) => {
      res.send('✅ Server is running.');
    });

    await client.db('admin').command({ ping: 1 });
    console.log('✅ MongoDB connected successfully!');
  } finally {
    // keep connection open
  }
}
run().catch(console.dir);

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
