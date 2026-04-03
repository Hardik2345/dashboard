const Session = require('../models/Session');
const { getClientIp } = require('../utils/ip');

const SESSION_WINDOW_MINUTES = parseInt(process.env.SESSION_WINDOW_MINUTES || '30', 10);

exports.createSession = async (req, res) => {
  try {
    console.log("[SessionController] POST /sessions received. Body:", req.body);
    console.log("[SessionController] Headers:", {
      "x-brand-id": req.headers["x-brand-id"],
      "x-role": req.headers["x-role"],
      "x-user-id": req.headers["x-user-id"]
    });

    const {
      sessionId,

      userId,
      email,
      startedAt,
      brand,
      isAdmin,
      userAgent,
      platform,
      screenWidth,
      screenHeight,
      timezone
    } = req.body;

    // Basic validation
    if (!sessionId || !userId || !email || !startedAt) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sessionId, userId, email, startedAt'
      });
    }

    const startedAtDate = new Date(startedAt);
    if (isNaN(startedAtDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid startedAt timestamp'
      });
    }

    // Check for existing session ID (uniqueness)
    const existingById = await Session.findOne({ sessionId });
    if (existingById) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate sessionId'
      });
    }

    // Check for 30-minute window for the same user
    const lastSession = await Session.findOne({ userId })
      .sort({ startedAt: -1 });

    if (lastSession) {
      const diffMs = startedAtDate - lastSession.startedAt;
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < SESSION_WINDOW_MINUTES) {
        console.log(`[SessionController] Ignoring duplicate session for ${userId}. Last update was ${diffMins}m ago.`);
        return res.status(200).json({
          success: true,
          ignored: true,
          message: `Session within window (${diffMins}m < ${SESSION_WINDOW_MINUTES}m)`,
        });
      }
    }

    // Capture metadata and IP
    const gatewayBrand = req.headers['x-brand-id'];
    const gatewayRole = req.headers['x-role'];
    const finalBrand = gatewayBrand || brand || null;
    const finalIsAdmin = gatewayRole ? (gatewayRole === 'author') : !!isAdmin;
    const ipAddress = getClientIp(req);

    // Create new session

    const newSession = new Session({
      sessionId,
      userId,
      email,
      startedAt: startedAtDate,
      brand: finalBrand,
      isAdmin: finalIsAdmin,
      userAgent,
      platform,
      screenWidth,
      screenHeight,
      timezone,
      ipAddress
    });


    await newSession.save();
    console.log(`[SessionController] Session ${sessionId} saved successfully for brand ${finalBrand}.`);

    return res.status(201).json({
      success: true,
      message: 'Session registered',
      data: { sessionId: newSession.sessionId }
    });

  } catch (error) {
    console.error('[SessionController] Error creating session:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

exports.healthCheck = (req, res) => {
  res.status(200).json({ status: 'OK', service: 'sessions-service' });
};
