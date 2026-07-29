"use strict";

const { query } = require("../business-radar/db");

function mapWork(row) {
  if (!row) return null;
  return {
    id: row.id,
    workType: row.work_type,
    title: row.title,
    status: row.status,
    inputData: row.input_data || {},
    outputData: row.output_data || {},
    validationStatus: row.validation_status,
    createdBy: row.created_by,
    validatedBy: row.validated_by,
    validatedAt: row.validated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueAt: row.due_at,
    status: row.status,
    relatedWorkId: row.related_work_id,
    createdBy: row.created_by,
    completedBy: row.completed_by,
    completedAt: row.completed_at,
    createdAt: row.created_at
  };
}

function normalizeTaskInput(input = {}) {
  const title = String(input.title || "").trim().slice(0, 300);
  if (!title) {
    throw Object.assign(new Error("Le titre de la tache est requis."), {
      code: "VALIDATION_ERROR"
    });
  }
  return {
    title,
    description: String(input.description || "").trim().slice(0, 3000) || null,
    dueAt: input.dueAt || null,
    relatedWorkId: input.relatedWorkId || null
  };
}

async function logActivity(eventType, entityType, entityId, details, actor) {
  await query(`
    INSERT INTO commercial_ai_activity (
      event_type, entity_type, entity_id, details, actor
    ) VALUES ($1,$2,$3,$4::jsonb,$5)
  `, [eventType, entityType, entityId || null, JSON.stringify(details || {}), actor]);
}

async function saveWork(result, actor) {
  const saved = await query(`
    INSERT INTO commercial_ai_work_items (
      work_type, title, status, input_data, output_data,
      validation_status, created_by
    )
    VALUES ($1,$2,'draft',$3::jsonb,$4::jsonb,'pending',$5)
    RETURNING *
  `, [
    result.input.type,
    result.input.title,
    JSON.stringify(result.input),
    JSON.stringify(result),
    actor
  ]);
  const work = mapWork(saved.rows[0]);
  await logActivity("analysis_created", "work_item", work.id, {
    workType: work.workType,
    validationStatus: work.validationStatus
  }, actor);
  return work;
}

async function listWork(type, limit = 100) {
  const values = [];
  const where = type ? "WHERE work_type = $1" : "";
  if (type) values.push(type);
  values.push(Math.min(200, Math.max(1, Number(limit) || 100)));
  const result = await query(`
    SELECT *
    FROM commercial_ai_work_items
    ${where}
    ORDER BY created_at DESC
    LIMIT $${values.length}
  `, values);
  return result.rows.map(mapWork);
}

async function validateWork(id, decision, actor) {
  if (!["approved", "rejected"].includes(decision)) {
    throw Object.assign(new Error("Decision de validation invalide."), {
      code: "VALIDATION_ERROR"
    });
  }
  const validationStatus = decision;
  const result = await query(`
    UPDATE commercial_ai_work_items
    SET validation_status = $2, validated_by = $3, validated_at = now(), updated_at = now()
    WHERE id = $1
    RETURNING *
  `, [id, validationStatus, actor]);
  const work = mapWork(result.rows[0]);
  if (!work) {
    throw Object.assign(new Error("Brouillon introuvable."), { code: "NOT_FOUND" });
  }
  await logActivity("validation_recorded", "work_item", work.id, {
    decision: validationStatus
  }, actor);
  return work;
}

async function createTask(input, actor) {
  const normalized = normalizeTaskInput(input);
  const result = await query(`
    INSERT INTO commercial_ai_tasks (
      title, description, due_at, status, related_work_id, created_by
    )
    VALUES ($1,$2,$3,'open',$4,$5)
    RETURNING *
  `, [
    normalized.title,
    normalized.description,
    normalized.dueAt,
    normalized.relatedWorkId,
    actor
  ]);
  const task = mapTask(result.rows[0]);
  await logActivity("task_created", "task", task.id, { dueAt: task.dueAt }, actor);
  return task;
}

async function listTasks(limit = 100) {
  const result = await query(`
    SELECT *
    FROM commercial_ai_tasks
    ORDER BY (status = 'open') DESC, due_at ASC NULLS LAST, created_at DESC
    LIMIT $1
  `, [Math.min(200, Math.max(1, Number(limit) || 100))]);
  return result.rows.map(mapTask);
}

async function listActivity(limit = 100) {
  const result = await query(`
    SELECT *
    FROM commercial_ai_activity
    ORDER BY created_at DESC
    LIMIT $1
  `, [Math.min(200, Math.max(1, Number(limit) || 100))]);
  return result.rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: row.details || {},
    actor: row.actor,
    createdAt: row.created_at
  }));
}

module.exports = {
  createTask,
  listActivity,
  listTasks,
  listWork,
  logActivity,
  normalizeTaskInput,
  saveWork,
  validateWork
};
