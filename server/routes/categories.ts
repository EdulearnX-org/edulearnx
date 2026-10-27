import { RequestHandler } from "express";
import { query } from "../db/connection.js";
import type { Category, CreateCategoryRequest, ApiResponse } from "@shared/api";

export const getCategories: RequestHandler = async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, COUNT(cc.course_id)::int AS course_count 
       FROM categories c 
       LEFT JOIN course_categories cc ON cc.category_id = c.id 
       GROUP BY c.id 
       ORDER BY c.name ASC`
    );
    res.json({
      success: true,
      data: result.rows,
      message: "Categories fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch categories",
    });
  }
};

export const getCategoryBySlug: RequestHandler = async (req, res) => {
  try {
    const { slug } = req.params;
    const result = await query(
      `SELECT c.*, COUNT(cc.course_id)::int AS course_count 
       FROM categories c 
       LEFT JOIN course_categories cc ON cc.category_id = c.id 
       WHERE c.slug = $1 
       GROUP BY c.id`,
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Category not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Category fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching category:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch category",
    });
  }
};

export const createCategory: RequestHandler = async (req, res) => {
  try {
    const { name, description, slug } = req.body as CreateCategoryRequest;

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: name, slug",
      });
    }

    const result = await query(
      "INSERT INTO categories (name, description, slug) VALUES ($1, $2, $3) RETURNING *",
      [name, description || null, slug]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Category created successfully",
    });
  } catch (error: any) {
    console.error("Error creating category:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Category with this name or slug already exists",
      });
    }
    res.status(500).json({
      success: false,
      error: "Failed to create category",
    });
  }
};

export const updateCategory: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, slug } = req.body;

    const result = await query(
      "UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description), slug = COALESCE($3, slug) WHERE id = $4 RETURNING *",
      [name || null, description || null, slug || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Category not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Category updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating category:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Category with this name or slug already exists",
      });
    }
    res.status(500).json({
      success: false,
      error: "Failed to update category",
    });
  }
};

export const deleteCategory: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query("DELETE FROM categories WHERE id = $1 RETURNING id", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Category not found",
      });
    }

    res.json({
      success: true,
      data: { id: result.rows[0].id },
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete category",
    });
  }
};

// Assign category to course
export const assignCategoryToCourse: RequestHandler = async (req, res) => {
  try {
    const { course_id, category_id } = req.body;

    if (!course_id || !category_id) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: course_id, category_id",
      });
    }

    const result = await query(
      "INSERT INTO course_categories (course_id, category_id) VALUES ($1, $2) RETURNING *",
      [course_id, category_id]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Category assigned to course successfully",
    });
  } catch (error: any) {
    console.error("Error assigning category:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Category already assigned to this course",
      });
    }
    res.status(500).json({
      success: false,
      error: "Failed to assign category",
    });
  }
};

// Remove category from course
export const removeCategoryFromCourse: RequestHandler = async (req, res) => {
  try {
    const { course_id, category_id } = req.params;

    const result = await query(
      "DELETE FROM course_categories WHERE course_id = $1 AND category_id = $2 RETURNING *",
      [course_id, category_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Category assignment not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Category removed from course successfully",
    });
  } catch (error) {
    console.error("Error removing category:", error);
    res.status(500).json({
      success: false,
      error: "Failed to remove category",
    });
  }
};

// Get categories for a course
export const getCategoriesForCourse: RequestHandler = async (req, res) => {
  try {
    const { course_id } = req.params;

    const result = await query(
      `SELECT cat.* 
       FROM categories cat
       INNER JOIN course_categories cc ON cc.category_id = cat.id
       WHERE cc.course_id = $1
       ORDER BY cat.name ASC`,
      [course_id]
    );

    res.json({
      success: true,
      data: result.rows,
      message: "Course categories fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching course categories:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch course categories",
    });
  }
};
