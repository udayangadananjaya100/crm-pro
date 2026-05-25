/**
 * Pro CRM — Products & Services Test Suite
 */
const axios = require('axios');
const productService = require('../src/services/product');
const geminiService = require('../src/services/gemini');
const { initializeDatabase, close, query } = require('../src/config/database');
const { loadAllRules } = require('../src/utils/rulesLoader');
const logger = require('../src/utils/logger');

const API_URL = 'http://localhost:3000/api';

async function runTests() {
  console.log('══════════════════════════════════════════════════════');
  console.log('        PRO CRM — PRODUCTS & SERVICES TEST SUITE      ');
  console.log('══════════════════════════════════════════════════════\n');

  let adminToken = '';
  let testProductId = '';
  let syncedKbDocId = '';

  try {
    // Initialize database connection and rules loader
    await initializeDatabase();
    loadAllRules();
    console.log('✅ System: Database and rules loader initialized successfully.');

    // 1. Get auth token
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@procrm.com',
      password: 'admin123'
    });
    adminToken = loginRes.data.token;
    console.log('✅ Auth: Logged in successfully. Token acquired.');

    // 2. Fetch list of products (initially empty or seeded)
    const listRes = await axios.get(`${API_URL}/products`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log(`✅ API: Listed products. Count: ${listRes.data.length}`);

    // 3. Create a test product
    const createPayload = {
      name: 'Test Auto Insurance Policy',
      description: 'Comprehensive coverage for passenger vehicles with road assistance.',
      price: 150.00,
      is_active: 1
    };
    const createRes = await axios.post(`${API_URL}/products`, createPayload, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    testProductId = createRes.data.id;
    console.log(`✅ API: Created product "${createRes.data.name}". ID: ${testProductId}`);

    // Assert Knowledge Base sync on create
    const kbDocCheck = await query("SELECT id, status, metadata FROM knowledge_documents WHERE doc_type = 'product'");
    let foundKbDoc = null;
    for (const row of kbDocCheck.rows) {
      let meta = row.metadata;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch (e) { meta = {}; }
      }
      if (meta && meta.product_id === testProductId) {
        foundKbDoc = row;
        break;
      }
    }
    if (foundKbDoc && foundKbDoc.status === 'active') {
      syncedKbDocId = foundKbDoc.id;
      console.log(`✅ Knowledge Base: Document synced successfully on product creation. ID: ${syncedKbDocId}`);
    } else {
      throw new Error('Knowledge Base document sync failed on creation');
    }

    // 4. Update the product details
    const updatePayload = {
      name: 'Updated Test Auto Insurance',
      description: 'Comprehensive vehicle coverage including towing and rental car support.',
      price: 175.50,
      is_active: 1
    };
    const updateRes = await axios.put(`${API_URL}/products/${testProductId}`, updatePayload, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log(`✅ API: Updated product name: "${updateRes.data.name}", Price: ${updateRes.data.price}`);

    // Assert Knowledge Base sync on update
    const kbDocCheckUpdate = await query("SELECT id, title FROM knowledge_documents WHERE id = $1", [syncedKbDocId]);
    if (kbDocCheckUpdate.rows.length > 0 && kbDocCheckUpdate.rows[0].title === 'Product: Updated Test Auto Insurance') {
      console.log(`✅ Knowledge Base: Document title synced successfully on update. Title: "${kbDocCheckUpdate.rows[0].title}"`);
    } else {
      throw new Error('Knowledge Base title sync failed on update');
    }

    // 5. Verify the product is loaded in active products text
    const activeProducts = await productService.listProducts();
    const testProd = activeProducts.find(p => p.id === testProductId);
    if (testProd && (testProd.is_active === 1 || testProd.is_active === true)) {
      console.log('✅ Service: Product retrieved from database and active state verified.');
    } else {
      throw new Error('Product not found or not marked active in DB');
    }

    // 6. Test Gemini prompt injection integration
    console.log('🤖 AI Integration: Testing system prompt context construction...');
    const result = await geminiService.generateResponse({
      messageText: 'What products/services do you offer?',
      conversationHistory: [
        { direction: 'inbound', content: 'What products/services do you offer?' }
      ],
      intent: 'sales',
      language: 'en',
      contactName: 'Jane Doe',
      aiOverrides: {
        forceFailure: false
      }
    });
    
    console.log(`✅ AI Integration: Gemini response generated. Success: ${result.success}`);
    if (result.reply) {
      console.log(`💬 Bot Reply preview: "${result.reply.substring(0, 120)}..."`);
    }

    // 7. Toggle product status to OFF
    const toggleRes = await axios.patch(`${API_URL}/products/${testProductId}/toggle`, {
      is_active: 0
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log(`✅ API: Toggled product active status to: ${toggleRes.data.is_active}`);

    // Assert Knowledge Base sync on toggle
    const kbDocCheckToggle = await query("SELECT status FROM knowledge_documents WHERE id = $1", [syncedKbDocId]);
    if (kbDocCheckToggle.rows.length > 0 && kbDocCheckToggle.rows[0].status === 'inactive') {
      console.log(`✅ Knowledge Base: Document status toggled to "inactive" successfully.`);
    } else {
      throw new Error('Knowledge Base status toggle sync failed');
    }

    // Verify it is off
    const activeProductsAfter = await productService.listProducts();
    const testProdAfter = activeProductsAfter.find(p => p.id === testProductId);
    if (testProdAfter && (testProdAfter.is_active === 0 || testProdAfter.is_active === false)) {
      console.log('✅ Service: Product successfully deactivated in database.');
    } else {
      throw new Error('Deactivation failed');
    }

    // 8. Delete the test product
    const deleteRes = await axios.delete(`${API_URL}/products/${testProductId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log(`✅ API: Deleted product. Success: ${deleteRes.data.success}`);

    // Assert Knowledge Base sync on delete
    const kbDocCheckDelete = await query("SELECT id FROM knowledge_documents WHERE id = $1", [syncedKbDocId]);
    if (kbDocCheckDelete.rows.length === 0) {
      console.log(`✅ Knowledge Base: Document deleted successfully.`);
    } else {
      throw new Error('Knowledge Base document delete sync failed');
    }

    console.log('\n══════════════════════════════════════════════════════');
    console.log('  🎉 RESULTS: ALL PRODUCTS & SERVICES TESTS PASSED!   ');
    console.log('══════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err.message);
    if (err.response) {
      console.error('Response Data:', err.response.data);
    }
    process.exit(1);
  } finally {
    await close().catch(() => {});
  }
}

runTests();
