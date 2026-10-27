// Simple API test script
const API_BASE = 'http://localhost:8080/api';

async function testAPI() {
  console.log('Testing Course Management API...\n');

  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthRes = await fetch(`${API_BASE}/health`);
    const healthData = await healthRes.json();
    console.log('Health:', healthData);

    // Test categories
    console.log('\n2. Creating a category...');
    const catRes = await fetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Programming',
        slug: 'programming',
        description: 'Programming and software development courses'
      })
    });
    const catData = await catRes.json();
    console.log('Category created:', catData);

    // Test tags
    console.log('\n3. Creating a tag...');
    const tagRes = await fetch(`${API_BASE}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'JavaScript',
        slug: 'javascript'
      })
    });
    const tagData = await tagRes.json();
    console.log('Tag created:', tagData);

    // Get all categories
    console.log('\n4. Getting all categories...');
    const catsRes = await fetch(`${API_BASE}/categories`);
    const catsData = await catsRes.json();
    console.log('Categories:', catsData);

    // Get all tags
    console.log('\n5. Getting all tags...');
    const tagsRes = await fetch(`${API_BASE}/tags`);
    const tagsData = await tagsRes.json();
    console.log('Tags:', tagsData);

    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAPI();
