const mysql = require('mysql');
const AWS = require('aws-sdk');
AWS.config.update({region: 'us-west-2'});

const fetch = (connection, id, date) => {
  return new Promise((resolve, reject) => {
let script = `SELECT `
      script += `	916 as google_product_category, `
      script += `	CONCAT(IF(vd.type = "new", "New", "Used"), CONCAT(" ", CONCAT(vd.year, CONCAT(" ", CONCAT(vd.make, CONCAT(" ", CONCAT(vd.model, COALESCE(vd.trim, CONCAT(" ", vd.trim),"")))))))) as title, `
      script += `	CONCAT(IF(vd.type = "new", "New", "Used"), CONCAT(" ", CONCAT(vd.year, CONCAT(" ", CONCAT(vd.make, CONCAT(" ", CONCAT(vd.model, COALESCE(vd.trim, CONCAT(" ", vd.trim),"")))))))) as description, `
      script += `	vd.vin as VIN, `
      script += `	vd.vin as id, `
      script += `	IF(d.gmc_id is null or d.gmc_id = '', d.dealer_ref_id, d.gmc_id) as store_code, `
      script += `	d.dealer_name as store_name, `
      script += `	CONCAT(d.dealer_address, CONCAT(", ", CONCAT(d.dealer_city, CONCAT(", ", CONCAT(d.dealer_state, CONCAT(" ", d.dealer_zip)))))) as store_address, `
      script += `	case when vd.additional_images_url is null or vd.additional_images_url = '' or (locate(',', vd.additional_images_url) = 0 and locate(';', vd.additional_images_url) = 0) or (d.has_overlay = 0 or d.has_overlay is null) then `
      script += `		vd.image_url `
      script += `	else `
      script += `		substring_index(substring_index(REPLACE(vd.additional_images_url, ";", ","), ',', 2), ',', -1) `
      script += `	end as image_link, `
      script += `	case when vd.additional_images_url is null or vd.additional_images_url = '' then `
      script += `	    concat_ws(',', vd.image_url, vd.image_url) `  
      script += `	when locate(',', REPLACE(vd.additional_images_url, ";", ",")) > 0 and d.has_overlay = 1 then `  
      script += `	    concat((select image_link), substring_index(REPLACE(vd.additional_images_url, ";", ","), (select image_link), -1)) `        
      script += `	else `    
      script += `	    REPLACE(vd.additional_images_url, ";", ",") `  
      script += `	end as additional_image_link, `  
      script += `	CONCAT(vd.vdp_page, "?store={store_code}") as link_template, `
      script += `	CONCAT(vd.sale_price, " USD") as price, `
      script += `	IF(vd.msrp is null or vd.msrp = 0, CONCAT(vd.sale_price, " USD"), CONCAT(vd.msrp, " USD")) as vehicle_msrp, `
      script += `	IF(vd.type = "new", "new", "used") as 'condition', `
      script += `	vd.make as brand, `
      script += `   vd.model as model, `
      script += `   COALESCE(vd.trim, "") as trim, `
      script += `   vd.year as year, `
      script += `   CONCAT(COALESCE(REPLACE(SUBSTRING(REPLACE(vd.mileage, ",", ""), 1, 6), " ", ""), 0), " miles") as mileage, `
      script += `   "" as link, `
      script += `   vd.exterior_color as color, `
      script += `   case when length(vd.options) <= 250 or (vd.options is null or vd.options = '') then `
      script += `       IF(vd.options is not null, IF(vd.options = '', "Air Conditioning", vd.options), COALESCE(vd.options, "Air Conditioning"))`
      script += `   when substring(vd.options, 251, 1) = ',' then `
      script += `       substring(vd.options, 1, 250) `
      script += `   else `
      script += `       replace(substring(vd.options, 1, 250), concat(',', substring_index(substring(vd.options, 1, 250), ',', '-1')), '') `
      script += `   end as vehicle_option, `
      script += `	case when vd.store_code is null or vd.store_code = '' or vd.store_code = IF(d.gmc_id is null or d.gmc_id = '', d.dealer_ref_id, d.gmc_id) then `
      script += `		CONCAT("in_store:", IF(d.gmc_id is null or d.gmc_id = '', d.dealer_ref_id, d.gmc_id)) `
      script += `	else `
      script += `		CONCAT("ship_to_store:", vd.store_code) `
      script += `	end as vehicle_fulfillment `      
      script += `FROM vdp_details_report vd, dealer d `
      script += `WHERE d.id = vd.dealer `
      script += `AND d.dealer_ref_id = ${id}    `
      script += `AND vd.created_date = "${date}"  ` 
      script += `AND vd.sale_price > 0 `
      script += `AND ((vd.type = 'new' AND d.carType = 'new') OR (vd.type <> 'new' and d.carType = 'used') OR d.carType is null OR d.carType = '' OR d.carType = 'all') `      
      script += `AND vd.sale_price is not null    `
      script += `AND vd.exterior_color is not null    `
      script += `AND (vd.off_site_ignore is null or vd.off_site_ignore = 0) `
      
      console.log("SCRIPT:");
      console.log(script);
      connection.query(script, function (error, results, fields) {
        if (error) {
            reject(error);
        } else {
            resolve(results);
        }
      });
  })
}

const mapData = (result) => {
    const columns = ['google_product_category', 'title', 'description', 'VIN', 'id', 'store_code', 'store_name', 'store_address', 'image_link', 'additional_image_link', 'link_template', 'price', 'vehicle_msrp', 'condition', 'brand', 'model', 'trim', 'year', 'mileage', 'link', 'color', 'vehicle_option', 'vehicle_fulfillment']
    const lines = result
    .map(item => {
        let lineValues = [];
        columns.forEach(c => {
            lineValues.push(item[c] ? item[c] : '')
        })
        return lineValues.join("\t");
    })
    .join('\r\n');
    return columns.join("\t") + "\r\n" + lines;
}

const end = (connection) => {
  return new Promise((resolve, reject) => {
      connection.end(function (err) {
            if (err) {
                reject(err);   
            } else {
                resolve();    
            }
      });
  })
}

exports.handler = async (event) => {
    var connection;
    try {
        connection = mysql.createConnection({
            host: process.env.RDS_HOST,
            user: process.env.RDS_USER,
            password: process.env.RDS_PASSWORD,
            database: process.env.RDS_DATABASE
        });

        let date = new Date();
        let minDate = new Date();
        minDate.setDate(date.getDate() - 2);

        let exists = false;
        do {
            let inDate = date.toISOString().split('T')[0];
            var result = await fetch(connection, event.pathParameters.id, inDate);
            if (result.length > 0) {
            exists = true;
            }
            date.setDate(date.getDate() - 1);
        } while (date >= minDate && !exists);

        const text = mapData(result); 

        await end(connection);
        
        const response = {
            statusCode: 200,
            headers: {"Access-Control-Allow-Origin": "*"},
            body: text
        };
        return response;  
    } catch (error) {
        console.log('ERROR');
        console.log(JSON.stringify(error));
        if (connection) connection.destroy();
        const response = {
            statusCode: 502,
            headers: {"Access-Control-Allow-Origin": "*"},
            body: JSON.stringify(error)
        };
        return response;
    }
  };