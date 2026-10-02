const express=require("express")

const visaCategory=express.Router()
const { db } = require('../../config/dataBase'); // adjust path accordingly


visaCategory.get('/',async(req,res)=>{
    try {
    // Fetch required fields from the standalone VISA_CATEGORY table
    const { supabase } = await db();

    const { data, error } = await supabase
      .from('visa_category')
      .select('*')
      .order('name', { ascending: true }); // Optional: Order alphabetically by name

    // Handle database query errors
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Failed to retrieve visa categories.',
        error: error.message
      });
    }

    // Return successful response
    return res.status(200).json({
      success: true,
      count: data.length,
      data: data
    });

  } catch (err) {
    // Handle unexpected server crashes
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
      error: err.message
    });
  }
})

visaCategory.post('/',async(req,res)=>{
    const { code, name, description } = req.body;

    const { supabase } = await db();

  
  // Simulated authenticated admin user context (Replace with actual auth middleware data)
  const currentAdminUser = req.user?.username || 'admin_user';

  // 1. Validation: Check required fields
  if (!code || !name) {
    return res.status(400).json({
      success: false,
      message: "Both 'code' and 'name' are required fields."
    });
  }

  // 2. Validation: Length constraints
  if (code.length > 50) {
    return res.status(400).json({ success: false, message: "Code must be max 50 characters." });
  }
  if (name.length > 100) {
    return res.status(400).json({ success: false, message: "Name must be max 100 characters." });
  }

  try {
    // 3. Insert data explicitly into VISA_CATEGORY (Acceptance Criteria b, d, e)
    const { data: newCategory, error: insertError } = await supabase
      .from('visa_category')
      .insert([
        {
          code: code.toUpperCase().trim(), // Standardize code format
          name: name.trim(),
          description: description ? description.trim() : null,
          created_by: currentAdminUser,
          updated_by: currentAdminUser
          // Note: creation_timestamp and updation_timestamp should handle defaults at DB level (e.g., NOW())
        }
      ])
      .select()
      .single();

    // 4. Error Handling (Acceptance Criteria c / Validation 4)
    if (insertError) {
      // PostgREST unique violation code is usually '23505'
      if (insertError.code === '23505') {
        return res.status(409).json({
          success: false,
          message: "This visa category already exists"
        });
      }
      throw insertError;
    }

    // 5. System Log Tracking (Acceptance Criteria f)
    const { error: logError } = await supabase
      .from('system_log')
      .insert([
        {
          action_type: 'CREATE',
          table_name: 'VISA_CATEGORY',
          details: `Created visa category code: ${code}`,
          triggered_by: currentAdminUser
        }
      ]);

    if (logError) {
      console.error('System log failure:', logError.message);
      // Don't fail the entire request if just the audit log tracking fails, depending on your business rules
    }

    // 6. Return successful response
    return res.status(201).json({
      success: true,
      message: 'Visa category created successfully.',
      data: newCategory
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
      error: err.message
    });
  }
})


visaCategory.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, description } = req.body;

    const codeValue = code?.trim();
    const nameValue = name?.trim();
    const descriptionValue = description?.trim() || null;

    if (!codeValue || !nameValue) {
      return res.status(400).json({
        success: false,
        message: "Both 'code' and 'name' are required fields."
      });
    }

    if (codeValue.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Code must be max 50 characters."
      });
    }

    if (nameValue.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Name must be max 100 characters."
      });
    }

    const { supabase } = await db();

    const currentAdminUser = req.user?.username || "admin_user";

    // Check if record exists
    const { data: existing } = await supabase
      .from("visa_category")
      .select("visa_category_id")
      .eq("visa_category_id", id)
      .maybeSingle();

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Visa category not found."
      });
    }

    const { data, error } = await supabase
      .from("visa_category")
      .update({
        code: codeValue.toUpperCase(),
        name: nameValue,
        description: descriptionValue,
        updated_by: currentAdminUser,
        updation_timestamp: new Date().toISOString() // Ensure timestamp is in ISO format
      })
      .eq("visa_category_id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "Visa category already exists."
        });
      }

      throw error;
    }

    // Audit Log
    await supabase.from("system_log").insert([
      {
        action_type: "UPDATE",
        table_name: "VISA_CATEGORY",
        details: `Updated visa category (${codeValue.toUpperCase()})`,
        triggered_by: currentAdminUser
      }
    ]);

    return res.status(200).json({
      success: true,
      message: "Visa category updated successfully.",
      data
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
});

visaCategory.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { supabase } = await db();

    const currentAdminUser = req.user?.username || "admin_user";

    // Check if category exists
    const { data: existing } = await supabase
      .from("visa_category")
      .select("visa_category_id, code")
      .eq("visa_category_id", id)
      .maybeSingle();

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Visa category not found."
      });
    }

    const { error } = await supabase
      .from("visa_category")
      .delete()
      .eq("visa_category_id", id);

    if (error) {
      throw error;
    }

    // Audit Log
    await supabase.from("system_log").insert([
      {
        action_type: "DELETE",
        table_name: "VISA_CATEGORY",
        details: `Deleted visa category (${existing.code})`,
        triggered_by: currentAdminUser
      }
    ]);

    return res.status(200).json({
      success: true,
      message: "Visa category deleted successfully."
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
});

module.exports = visaCategory