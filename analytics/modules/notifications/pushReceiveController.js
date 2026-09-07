const { saveInventoryNotification } = require('./inventoryNotification');
const admin = require('firebase-admin'); 
const logger = require('../../shared/utils/logger'); 

function calculateDeltaPercentage(oldValue, newValue) {
  if (!oldValue || oldValue === 0) return 0;
  return (((oldValue - newValue) / oldValue) * 100).toFixed(2);
}

module.exports = async function handlePushReceive(req, res) {
  try {
    const pipelineKey = req.headers["x-pipeline-key"];
    if (pipelineKey !== process.env.X_PIPELINE_KEY) {
      return res.status(401).json({ error: "Unauthorized: Invalid Pipeline Key" });
    }

    const payload = req.body;
    const {
      shop_domain,
      product_id,
      product_title,
      variant_id,
      date,
      inventoryQty, old_inventoryQty,
      drr7, old_drr7,
      doh7, old_doh7
    } = payload;

    const drrThreshold = parseFloat(process.env.DRR_THRESHOLD || 0);
    const dohThreshold = parseFloat(process.env.DOH_THRESHOLD || 0);
    const qtyThreshold = parseFloat(process.env.INVENTORY_QTY_THRESHOLD || 0);

    const alertsToTrigger = [];

    // DRR Alert
    if (drr7 < drrThreshold) {
      const delta = calculateDeltaPercentage(old_drr7, drr7);
      alertsToTrigger.push({
        metric_type: 'DRR',
        current_value: drr7,
        old_value: old_drr7,
        delta_percentage: delta,
        subject: `LOW DRR | ${product_title} | current value: ${drr7}`,
        description: `${product_id} | ${product_title} | DRR dropped by ${delta}%`
      });
    }

    // DOH Alert
    if (doh7 < dohThreshold) {
      const delta = calculateDeltaPercentage(old_doh7, doh7);
      alertsToTrigger.push({
        metric_type: 'DOH',
        current_value: doh7,
        old_value: old_doh7,
        delta_percentage: delta,
        subject: `LOW DOH | ${product_title} | current value: ${doh7}`,
        description: `${product_id} | ${product_title} | DOH dropped by ${delta}%`
      });
    }

    // Inventory Qty Alert
    if (inventoryQty < qtyThreshold) {
      const delta = calculateDeltaPercentage(old_inventoryQty, inventoryQty);
      alertsToTrigger.push({
        metric_type: 'INVENTORY_QTY',
        current_value: inventoryQty,
        old_value: old_inventoryQty,
        delta_percentage: delta,
        subject: `LOW INVENTORY | ${product_title} | current value: ${inventoryQty}`,
        description: `${product_id} | ${product_title} | INVENTORY_QTY dropped by ${delta}%`
      });
    }

    // Process alerts
    const savedNotifications = [];
    for (const alert of alertsToTrigger) {
      const doc = {
        shop_domain,
        product_id,
        variant_id,
        date,
        metric_type: alert.metric_type,
        subject: alert.subject,
        description: alert.description,
        current_value: alert.current_value,
        old_value: alert.old_value,
        delta_percentage: alert.delta_percentage
      };

      const notification = await saveInventoryNotification(doc);
      savedNotifications.push(notification);

      // Trigger FCM Push notification
      try {
        const topic = shop_domain.replace(/[^a-zA-Z0-9-_.~%]/g, ''); // Ensure valid topic format
        const message = {
        topic: topic,
        notification: {
          title: alert.subject,
          body: alert.description
        },
        data: {
          product_id: String(product_id),
          variant_id: String(variant_id),
          notification_id: String(notification._id)
        }
      };
      await admin.messaging().send(message);
      logger.info(`[push-receive] Sent FCM alert to topic ${topic} for product ${product_id}`);
    } catch (fcmError) {
      if (logger && logger.error) {
        logger.error(`[push-receive] Failed to send FMC push: ${fcmError.message}`);
      } else {
        console.error(`[push-receive] Failed to send FMC push: ${fcmError.message}`);
      }
    }
  }

  res.status(200).json({ success: true, alerts_triggered: savedNotifications.length });

} catch (error) {
  if (logger && logger.error) {
    logger.error(`[push-receive] Error processing alert: ${error.message}`);
  } else {
    console.error(`[push-receive] Error processing alert: ${error.message}`);
  }
  res.status(500).json({ error: "Internal Server Error" });
}
};