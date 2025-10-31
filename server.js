const express = require("express");
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const userRoutes = require("./routes/userRoutes");
const productRoutes = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const authRoutes = require("./routes/authRoutes");
const viewRoutes = require("./routes/reviewsRoutes");
const cartRoutes = require("./routes/cartRoutes");
const profileRoutes = require("./routes/pofileRoutes");
const orderRoutes = require("./routes/orderRoutes");
const notificationRoutes = require('./routes/notificationRoutes');
const couponRoutes = require("./routes/couponRoutes");


require('./events/orderListeners');
require('./events/productListeners');
const requestLogger = require('./middlewares/requestLogger');

const logger = require('./middlewares/logger');
const errorHandler = require("./middlewares/errorHandler");
const auth = require("./middlewares/auth");

const { authLimiter, apiLimiter } = require('./middlewares/rate-limiter');
const { corsOptions } = require('./middlewares/security');
const cors = require('cors');
const helmet = require('helmet');

const connectDB = require("./config/db");
require("dotenv").config();
const app = express();
app.use(requestLogger);

app.use(express.json());
app.use(logger);
app.use(helmet());
app.use(cors(corsOptions));

connectDB();

// swagger
const options = {
  definition: {
    openapi: "3.1.0",
    info: {
      title: "E-Market API Documentation",
      version: "1.0",
      description: "This is a full documentation for our E-Market api",
    },
    servers: [
      {
        url: "http://localhost:3000",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: [
    "./routes/*.js",
    "./controllers/*.js",
    "./models/*.js"
  ]
};
app.use("/users", auth, apiLimiter, userRoutes);
app.use("/products", apiLimiter, productRoutes);
app.use("/categories", auth, apiLimiter, categoryRoutes);
app.use("/auth", authLimiter, authRoutes);
app.use("/profiles", auth, apiLimiter, profileRoutes);
app.use("/product", auth, apiLimiter, viewRoutes);
app.use("/carts", auth, cartRoutes);
app.use("/orders", auth, orderRoutes);
app.use('/notifications', auth, apiLimiter, notificationRoutes);
app.use("/coupons", auth, apiLimiter, couponRoutes);

app.use("/uploads", express.static("uploads"));
const specs = swaggerJsdoc(options);
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(specs, { explorer: true })
);

app.use(require('./middlewares/notFound'));

async function run() {
  try {
    await connectDB();
    console.log(" Running goes well");
  } catch (error) {
    console.log(error);
  }
}

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  run();
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;