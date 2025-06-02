const { Client } = require('@elastic/elasticsearch');
const redisClient = require('./redisClient');
const db = require('./database'); // Example import, adjust to your actual database module

module.exports.new_search = async (req, res, next) => {
  try {
    let query = req.query.q.replace(/\s+/g, " ").trim(); // Trim for cleaner input handling
    let pharmacyIds = JSON.stringify(req.body.pharmacyIds);

    const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_URL; // Use environment variables for configuration
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENSEARCH_AUTH}`, // Token-based auth
    };

    const client = new Client({ node: OPENSEARCH_ENDPOINT, headers });
    const requestBody = createRequestBody(query); // Refactor query creation to a function for better readability

    const response = await client.msearch({ body: requestBody });
    const { body } = response;
    const responses = body.responses;

    let cachedData = await redisClient.get(pharmacyIds);
    if (!cachedData) {
      console.log("Cache miss. Fetching and setting data...");
      pharmacyIds = await create_redis_inv(req);
      cachedData = await redisClient.get(pharmacyIds);
    }

    const extractedSuggestions = await extractSuggestions(responses, pharmacyIds);
    return res.status(200).json({ data: extractedSuggestions });
  } catch (error) {
    console.error("Error during search operation:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

async function extractSuggestions(results, pharmacyIds) {
  const extractedData = {
    saltSuggestions: [],
    medicineSuggestions: [],
    healthSuggestions: [],
  };

  results.forEach((result, index) => {
    result.hits.hits.forEach((item) => {
      const productDetails = {
        id: item._source.id,
        details: item._source,
        availability: getProduct(pharmacyIds, item._source.id) // Make synchronous to simplify
      };
      if (index === 0) extractedData.saltSuggestions.push(productDetails);
      else {
        if (item._source.is_healthProduct) extractedData.healthSuggestions.push(productDetails);
        else extractedData.medicineSuggestions.push(productDetails);
      }
    });
  });

  return extractedData;
}

function createRequestBody(query) {
  // Encapsulate the requestBody creation for maintainability
  return `
    {"index": "index_salt"}
    {"_source": ["salt", "salt_frequency","salt_id","salt_forms_json","available_forms","most_common"], "size": 20, "query": {"multi_match": {"query": "${encodeURIComponent(query)}", "fields": ["salt", "name_suggest"]}}}
    {"index": "index_medicine"}
    {"_source": ["name_with_short_pack", "id", "salt_full", "manufacturer_name", "salt_or_category","is_healthProduct"], "size": 50, "query": {"bool": {"should": [{"multi_match": {"query": "${encodeURIComponent(query)}", "fields": ["name_with_short_pack"],"fuzziness": "AUTO"}},{"multi_match": {"query": "${encodeURIComponent(query)}", "fields": ["salt_full"]}},{"multi_match": {"query": "${encodeURIComponent(query)}", "fields": ["manufacturer_name"]}}]}}}
  `;
}

const getProduct = async (pharmacyIds, productId) => {
  // Simplified to return promise directly
  return redisClient.get(pharmacyIds)
    .then(data => data ? JSON.parse(data).inventorysub.filter(item => item.product_id === productId) : [])
    .catch(error => {
      console.error("Failed to retrieve product details", error);
      throw new Error("Internal server error");
    });
};

const create_redis_inv = async (req) => {
  const nearestPharmacy = await getNearestPharmacy(req);
  let pharmacyIds = nearestPharmacy.map(pharmacy => pharmacy.id);

  const inventorysub = await db.inventory.findAll({
    where: { pharmacy_id: pharmacyIds },
  });

  await redisClient.set(JSON.stringify(pharmacyIds), JSON.stringify({ inventorysub }));
  return JSON.stringify(pharmacyIds);
};

const getNearestPharmacy = async (req) => {
  const { latitude, longitude } = req.body;
  if (!latitude || !longitude) {
    throw new Error("Latitude and longitude are required.");
  }

  return db.Phar_address.findAll({
    attributes: [['distance', sequelize.fn('ST_Distance', sequelize.col('location'), sequelize.fn('ST_SetSRID', sequelize.fn('ST_MakePoint', longitude, latitude), 3857))]],
    order: [['distance', 'ASC']],
    limit: 10
  });
};
