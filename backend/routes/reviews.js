const express = require('express');
const router = express.Router();
const Review = require('../models/Review');

// Public: submit a landing-page review (no login required)
router.post('/', async (req, res, next) => {
  try {
    const { name, organization, rating, message } = req.body;
    const review = await Review.create({
      name,
      organization,
      rating: Number(rating),
      message,
    });
    res.status(201).json({ success: true, review });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: 'Please fill in your name, a rating (1-5) and a message.' });
    }
    next(err);
  }
});

module.exports = router;
