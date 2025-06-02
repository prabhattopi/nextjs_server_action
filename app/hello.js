module.exports.new_search = async (req, res, next) => {
  try {
    let query = req.query.q;
    query = query.replace(/\s+/g, " ");
    let pharmacyIds = req.body.pharmacyIds;

    pharmacyIds = JSON.stringify(pharmacyIds);

    const OPENSEARCH_ENDPOINT = OPENSEARCH_URL;
    const INDEX_NAME = OPENSEARCH_INDEX;
    const headers = {
      "Content-Type": "application/json",
      Authorization: OPENSEARCH_AUTH,
    };

    const client = new Client({ node: OPENSEARCH_ENDPOINT, headers });

    const requestBody = `
  {"index": "index_salt"}
  {"_source": ["salt", "salt_frequency","salt_id","salt_forms_json","available_forms","most_common"], "size": 20, "query": {"multi_match": {"query": "${query}", "fields": ["salt", "name_suggest"]}}}
  {"index": "index_medicine"}
  {"_source": ["name_with_short_pack", "id", "salt_full", "manufacturer_name", "salt_or_category","is_healthProduct"], "size": 50, "query": {"bool": {"should": [{"multi_match": {"query": "${query}", "fields": ["name_with_short_pack"],"fuzziness": "AUTO"}},{"multi_match": {"query": "${query}", "fields": ["salt_full"]}},{"multi_match": {"query": "${query}", "fields": ["manufacturer_name"]}}]}}}
  `;

    const response = await client.msearch({ body: requestBody });
    const { body } = response;
    const responses = body.responses;

    const cachedData = await redisClient.get(pharmacyIds);
    // checking if the data is present for the specific key.
    // if not then setting the data in redis.
    // if yes leave it.
    if (!cachedData) {
      console.log("executed");
      pharmacyIds = await create_redis_inv(req, res, next);
    }

    async function extractSuggestions(result) {
      const extractedData = {
        saltSuggestions: [],
        medicineSuggestions: [],
        healthSuggestions: [],
      };

      // Extract salt suggestions
      if (result && result[0]?.hits.hits.length !== 0) {
        const saltSuggestions = result[0]?.hits.hits || [];
        extractedData.saltSuggestions = await Promise.all(
          saltSuggestions.map(async (item) => {
            productDetails = {
              id: item._source.salt_id,
              salt: item._source.salt,
              salt_frequency: item._source.salt_frequency,
              available_forms: item._source.available_forms,
              most_common: item._source.most_common,
              salt_forms_json: item._source.salt_forms_json,
            };
            const availability = await getProduct(
              pharmacyIds,
              item._source.salt_id
            );
            return { ...productDetails, availability };
          })
        );
        extractedData.saltSuggestions.sort(
          (a, b) => a.salt_frequency - b.salt_frequency
        );
      }

      // Extract medicine suggestions
      if (result && result[1]?.hits.hits.length !== 0) {
        const medicineSuggestions = result[1]?.hits.hits || [];

        extractedData.medicineSuggestions = await Promise.all(
          medicineSuggestions
            .filter((item) => item._source.is_healthProduct === false)
            .map(async (item) => {
              const productDetails = {
                id: item._source.id,
                salt_full: item._source.salt_full,
                manufacturer_name: item._source.manufacturer_name,
                salt_or_category: item._source.salt_or_category,
                name_with_short_pack: item._source.name_with_short_pack,
              };
              const availability = await getProduct(
                pharmacyIds,
                item._source.id
              );
              return { ...productDetails, availability };
            })
        );
      }

      // Extract health suggestions
      if (result && result[1]?.hits.hits.length !== 0) {
        const healthSuggestions = result[1]?.hits.hits || [];
        extractedData.healthSuggestions = await Promise.all(
          healthSuggestions
            .filter((item) => item._source.is_healthProduct === true)
            .map(async (item) => {
              const productDetails = {
                id: item._source.id,
                salt_full: item._source.salt_full,
                manufacturer_name: item._source.manufacturer_name,
                salt_or_category: item._source.salt_or_category,
                name_with_short_pack: item._source.name_with_short_pack,
                is_healthProduct: item._source.is_health_product,
              };
              const availability = await getProduct(
                pharmacyIds,
                item._source.id
              );
              return { ...productDetails, availability };
            })
        );
      }

      return extractedData;
    }
    const extractedSuggestions = await extractSuggestions(responses);

    let final_data = extractedSuggestions;
    return res.status(200).json({ data: final_data });
  } catch (error) {
    return res.status(200).json({ error: error.message });
  }
};

const getProduct = async (pharmacyIds, productId) => {
  try {
    const cachedData = await redisClient.get(pharmacyIds);

    if (!cachedData) {
      return {};
    }

    const dataArray = JSON.parse(cachedData);
    const inventorysub = dataArray.inventorysub;

    const filteredData = inventorysub
      .filter((item) => item.product_id === productId)
      .map((item) => ({
        pharmacy_id: item.pharmacy_id,
        selling_price: item.selling_price,
      }));

    return filteredData;
  } catch (error) {
    console.error(error);
    throw new Error("Internal server error");
  }
};

const create_redis_inv = async (req, res, next) => {
  try {
    const nearestPharmacy = await getNearestPharmacy(req, res, next);

    let pharmacyIds = nearestPharmacy.map((pharmacy) => pharmacy.id);

    const inventorysub = await db.inventory.findAll({
      where: {
        pharmacy_id: pharmacyIds,
      },
    });

    pharmacyIds = JSON.stringify(pharmacyIds);

    redisClient.set(pharmacyIds, JSON.stringify({ inventorysub }));

    return pharmacyIds;
  } catch (error) {
    console.log(error);
    throw new Error("Internal server error");
  }
};

const getNearestPharmacy = async (req, res, next) => {
  try {
    const userLatitude = req.body.latitude;
    const userLongitude = req.body.longitude;

    if (!userLatitude || !userLongitude) {
      throw new Error("Latitude and longitude are required.");
    }

    const pharmacies = await Phar_address.findAll({
      attributes: {
        include: [
          [
            sequelize.literal(
              `ST_Distance(location, ST_SetSRID(ST_MakePoint(${userLongitude}, ${userLatitude}), 3857))`
            ),
            "distance",
          ],
        ],
      },
      order: sequelize.literal("distance"),
      limit: 10,
    });

    const nearestPharmacies = pharmacies.map((pharmacy) => {
      return {
        id: pharmacy.id,
        distance: pharmacy.dataValues.distance,
      };
    });

    return nearestPharmacies;
  } catch (error) {
    console.log(error);
  }
};
