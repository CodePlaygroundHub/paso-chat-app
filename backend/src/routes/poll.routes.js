import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  createPoll,
  getGroupPolls,
  getPollById,
  votePoll,
  closePoll,
} from "../controllers/poll.controller.js";

const router = express.Router();

router.post("/groups/:groupId", protectRoute, createPoll);
router.get("/groups/:groupId", protectRoute, getGroupPolls);
router.get("/:pollId", protectRoute, getPollById);
router.post("/:pollId/vote", protectRoute, votePoll);
router.patch("/:pollId/close", protectRoute, closePoll);

export default router;
