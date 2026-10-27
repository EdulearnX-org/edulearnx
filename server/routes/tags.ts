import { RequestHandler } from "express";
import { query } from "../db/connection.js";
import type { Tag, CreateTagRequest } from "@shared/api";

export const getTags: RequestHandler = async (req, res) => {
  try {
    const result = await query(
      `SELECT t.*, COUNT(ct.course_id)::int AS course_count 
       FROM tags t 
       LEFT JOIN course_tags ct ON ct.tag_id = t.id 
       GROUP BY t.id 
       ORDER BY t.name ASC`
    );
    res.json({
      success: true,
      data: result.rows,
      message: "Tags fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching tags:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch tags",
    });
  }
};

export const getTagBySlug: RequestHandler = async (req, res) => {
  try {
    const { slug } = req.params;
    const result = await query(
      `SELECT t.*, COUNT(ct.course_id)::int AS course_count 
       FROM tags t 
       LEFT JOIN course_tags ct ON ct.tag_id = t.id 
       WHERE t.slug = $1 
       GROUP BY t.id`,
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Tag not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Tag fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching tag:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch tag",
    });
  }
};

export const createTag: RequestHandler = async (req, res) => {
  try {
    const { name, slug } = req.body as CreateTagRequest;

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: name, slug",
      });
    }

    const result = await query(
      "INSERT INTO tags (name, slug) VALUES ($1, $2) RETURNING *",
      [name, slug]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Tag created successfully",
    });
  } catch (error: any) {
    console.error("Error creating tag:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Tag with this name or slug already exists",
      });
    }
    res.status(500).json({
      success: false,
      error: "Failed to create tag",
    });
  }
};

export const updateTag: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug } = req.body;

    const result = await query(
      "UPDATE tags SET name = COALESCE($1, name), slug = COALESCE($2, slug) WHERE id = $3 RETURNING *",
      [name || null, slug || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Tag not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Tag updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating tag:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Tag with this name or slug already exists",
      });
    }
    res.status(500).json({
      success: false,
      error: "Failed to update tag",
    });
  }
};

export const deleteTag: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query("DELETE FROM tags WHERE id = $1 RETURNING id", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Tag not found",
      });
    }

    res.json({
      success: true,
      data: { id: result.rows[0].id },
      message: "Tag deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting tag:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete tag",
    });
  }
};

// Assign tag to course
export const assignTagToCourse: RequestHandler = async (req, res) => {
  try {
    const { course_id, tag_id } = req.body;

    if (!course_id || !tag_id) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: course_id, tag_id",
      });
    }

    const result = await query(
      "INSERT INTO course_tags (course_id, tag_id) VALUES ($1, $2) RETURNING *",
      [course_id, tag_id]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Tag assigned to course successfully",
    });
  } catch (error: any) {
    console.error("Error assigning tag:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Tag already assigned to this course",
      });
    }
    res.status(500).json({
      success: false,
      error: "Failed to assign tag",
    });
  }
};

// Remove tag from course
export const removeTagFromCourse: RequestHandler = async (req, res) => {
  try {
    const { course_id, tag_id } = req.params;

    const result = await query(
      "DELETE FROM course_tags WHERE course_id = $1 AND tag_id = $2 RETURNING *",
      [course_id, tag_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Tag assignment not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Tag removed from course successfully",
    });
  } catch (error) {
    console.error("Error removing tag:", error);
    res.status(500).json({
      success: false,
      error: "Failed to remove tag",
    });
  }
};

// Get tags for a course
export const getTagsForCourse: RequestHandler = async (req, res) => {
  try {
    const { course_id } = req.params;

    const result = await query(
      `SELECT t.* 
       FROM tags t
       INNER JOIN course_tags ct ON ct.tag_id = t.id
       WHERE ct.course_id = $1
       ORDER BY t.name ASC`,
      [course_id]
    );

    res.json({
      success: true,
      data: result.rows,
      message: "Course tags fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching course tags:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch course tags",
    });
  }
};
