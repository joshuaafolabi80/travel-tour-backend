const express = require('express');
const router = express.Router();
const hotelController = require('../controllers/hotelController');

router.get('/search-hotels', hotelController.searchHotels);
router.get('/get-hotel-details', hotelController.getHotelDetails);
router.get('/get-hotel-rates', hotelController.getHotelRates);

module.exports = router;