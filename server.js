
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const Product = require("./Product");

const app = express();
app.use(express.json());

// Create product
app.post("/products", async (req, res, next) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

// Get products with filtering, sorting and pagination
app.get("/products", async (req, res, next) => {
  try {
    const { category, search, sort = "name", order = "asc" } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));

    const filter = {};
    if (category) filter.category = category;
    if (search) filter.name = { $regex: search, $options: "i" };

    const allowedSort = ["name", "price", "quantity", "category"];
    const sortField = allowedSort.includes(sort) ? sort : "name";
    const sortOrder = order === "desc" ? -1 : 1;

    const products = await Product.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Product.countDocuments(filter);

    res.json({
      total,
      page,
      pages: Math.ceil(total / limit),
      products
    });
  } catch (err) {
    next(err);
  }
});

// Get single product
app.get("/products/:id", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// Update product details
app.put("/products/:id", async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// Delete product
app.delete("/products/:id", async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    next(err);
  }
});

// Restock or sell products
app.patch("/products/:id/stock", async (req, res, next) => {
  try {
    const { action, quantity } = req.body;

    if (!["restock", "sale"].includes(action) ||
        !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "Invalid action or quantity" });
    }

    const change = action === "restock" ? quantity : -quantity;
    const filter = { _id: req.params.id };

    if (action === "sale") filter.quantity = { $gte: quantity };

    const product = await Product.findOneAndUpdate(
      filter,
      { $inc: { quantity: change } },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(400).json({
        message: "Product not found or insufficient stock"
      });
    }

    res.json(product);
  } catch (err) {
    next(err);
  }
});

// Low-stock report (threshold = 5)
app.get("/reports/low-stock", async (req, res, next) => {
  try {
    const products = await Product.find({ quantity: { $lte: 5 } });
    res.json(products);
  } catch (err) {
    next(err);
  }
});

// Category-wise inventory summary
app.get("/reports/categories", async (req, res, next) => {
  try {
    const report = await Product.aggregate([
      {
        $group: {
          _id: "$category",
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalValue: {
            $sum: { $multiply: ["$price", "$quantity"] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json(report);
  } catch (err) {
    next(err);
  }
});

// Centralized error handler
app.use((err, req, res, next) => {
  if (err.name === "ValidationError" ||
      err.name === "CastError" ||
      err.code === 11000) {
    return res.status(400).json({ message: err.message });
  }

  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

// Connect database and start server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    app.listen(process.env.PORT || 3000, () => {
      console.log("Server running on port 3000");
    });
  })
  .catch(err => {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  });
