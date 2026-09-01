import mongoose from "mongoose";
import Group from "../models/group.model.js";
import Poll from "../models/poll.model.js";
import { io } from "../lib/socket.js";
import { computePollResults } from "../lib/pollResults.js";

// Helper — check if user is a member of the group
const isGroupMember = (group, userId) =>
  group.members.some((m) => m.userId.toString() === userId.toString());

// POST /api/polls/groups/:groupId
export const createPoll = async (req, res) => {
  try {
    const { groupId } = req.params;
    const creatorId = req.user._id;
    const { question, options, expiresAt } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group ID" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!isGroupMember(group, creatorId)) {
      return res.status(403).json({ message: "Not a group member" });
    }

    if (!question?.trim()) {
      return res.status(400).json({ message: "Poll question is required" });
    }

    if (!Array.isArray(options) || options.length < 2 || options.length > 10) {
      return res
        .status(400)
        .json({ message: "A poll must have between 2 and 10 options" });
    }

    const sanitizedOptions = options
      .map((o) => ({ text: typeof o === "string" ? o.trim() : o?.text?.trim() }))
      .filter((o) => o.text);

    if (sanitizedOptions.length < 2) {
      return res
        .status(400)
        .json({ message: "At least 2 non-empty options are required" });
    }

    const poll = await Poll.create({
      groupId,
      creatorId,
      question: question.trim(),
      options: sanitizedOptions,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    const populated = await poll.populate("creatorId", "fullName profilePic");

    // Broadcast to all group members
    io.to(groupId.toString()).emit("newGroupPoll", populated);

    res.status(201).json(populated);
  } catch (error) {
    console.error("Create poll error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/polls/groups/:groupId
export const getGroupPolls = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group ID" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!isGroupMember(group, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const polls = await Poll.find({ groupId })
      .populate("creatorId", "fullName profilePic")
      .sort({ createdAt: -1 });

    res.status(200).json(polls);
  } catch (error) {
    console.error("Get group polls error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/polls/:pollId
export const getPollById = async (req, res) => {
  try {
    const { pollId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(pollId)) {
      return res.status(400).json({ message: "Invalid poll ID" });
    }

    const poll = await Poll.findById(pollId).populate(
      "creatorId",
      "fullName profilePic",
    );
    if (!poll) {
      return res.status(404).json({ message: "Poll not found" });
    }

    const group = await Group.findById(poll.groupId);
    if (!group || !isGroupMember(group, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.status(200).json({
      ...poll.toObject(),
      results: computePollResults(poll),
    });
  } catch (error) {
    console.error("Get poll by id error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /api/polls/:pollId/vote
export const votePoll = async (req, res) => {
  try {
    const { pollId } = req.params;
    const { optionId } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(pollId)) {
      return res.status(400).json({ message: "Invalid poll ID" });
    }

    const poll = await Poll.findById(pollId);
    if (!poll) {
      return res.status(404).json({ message: "Poll not found" });
    }

    // Verify membership
    const group = await Group.findById(poll.groupId);
    if (!group || !isGroupMember(group, userId)) {
      return res.status(403).json({ message: "Not a group member" });
    }

    // Check poll is still active (not closed / not expired)
    if (poll.isClosed || (poll.expiresAt && new Date() > poll.expiresAt)) {
      return res.status(400).json({ message: "This poll is no longer active" });
    }

    const targetOption = poll.options.id(optionId);
    if (!targetOption) {
      return res.status(400).json({ message: "Option not found" });
    }

    // Remove user's vote from all options first (enforce single-choice)
    poll.options.forEach((opt) => {
      opt.votes = opt.votes.filter((v) => v.toString() !== userId.toString());
    });

    // Toggle: if user already had this option, the vote is now removed (removed above).
    // If not, add the vote.
    const alreadyVoted = targetOption.votes.some(
      (v) => v.toString() === userId.toString(),
    );

    if (!alreadyVoted) {
      targetOption.votes.push(userId);
    }

    await poll.save();

    const populated = await poll.populate("creatorId", "fullName profilePic");

    // Broadcast updated poll to the whole group
    io.to(poll.groupId.toString()).emit("pollUpdated", populated);

    res.status(200).json(populated);
  } catch (error) {
    console.error("Vote poll error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// PATCH /api/polls/:pollId/close
export const closePoll = async (req, res) => {
  try {
    const { pollId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(pollId)) {
      return res.status(400).json({ message: "Invalid poll ID" });
    }

    const poll = await Poll.findById(pollId);
    if (!poll) {
      return res.status(404).json({ message: "Poll not found" });
    }

    // Only the creator can close the poll
    if (poll.creatorId.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Only the poll creator can close it" });
    }

    if (poll.isClosed) {
      return res.status(400).json({ message: "Poll is already closed" });
    }

    poll.isClosed = true;
    await poll.save();

    const populated = await poll.populate("creatorId", "fullName profilePic");

    io.to(poll.groupId.toString()).emit("pollUpdated", populated);

    res.status(200).json(populated);
  } catch (error) {
    console.error("Close poll error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
