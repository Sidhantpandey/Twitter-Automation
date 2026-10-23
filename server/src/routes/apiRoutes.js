import express from 'express';
import { generateDraftController, getPostsController } from '../controllers/postController.js';
import { getSettingsController, updateSettingsController } from '../controllers/settingsController.js';
import { replyStatsController, publishHumanReplyController } from '../controllers/replyController.js';
import { enableSchedule, disableSchedule } from '../utils/schedulerService.js';
import { getXAccount } from '../utils/xService.js';

const router = express.Router();

router.get('/status', (_req, res) => {
  res.json({
    settings: getSettingsController,
    xAccount: getXAccount(),
  });
});

router.get('/settings', getSettingsController);
router.put('/settings', updateSettingsController);
router.post('/generate', generateDraftController);
router.get('/posts', getPostsController);

router.get('/replies/stats', replyStatsController);
router.post('/replies/publish', publishHumanReplyController);

router.post('/schedule/enable', async (_req, res) => {
  if (!getXAccount().connected) {
    return res.status(400).json({ error: 'Connect an X account first.' });
  }

  const nextRunAt = await enableSchedule();
  res.json({ enabled: true, nextRunAt });
});

router.post('/schedule/disable', (_req, res) => {
  disableSchedule();
  res.json({ enabled: false });
});

export default router;
