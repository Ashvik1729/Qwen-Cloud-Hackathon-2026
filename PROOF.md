# EchoDesk Alibaba Cloud ECS Proof

This file is included as the required proof artifact for the Qwen Cloud Hackathon submission.

## Screen recording link

Add final recording URL here before submission:

- **Alibaba Cloud ECS backend proof:** TODO

## Recording checklist

The proof recording should be separate from the product demo video and should show:

1. Alibaba Cloud console or terminal session connected to the ECS instance.
2. Instance metadata or hostname/IP proving the backend is running on Alibaba Cloud ECS.
3. The EchoDesk backend health endpoint responding successfully.
4. The app invoking the memory API from the deployed service.

Suggested terminal commands for the recording:

```bash
curl http://100.100.100.200/latest/meta-data/instance-id
curl http://100.100.100.200/latest/meta-data/region-id
curl https://YOUR_DEPLOYED_DOMAIN/api/health
```

## Notes

- Keep API keys out of the recording.
- The product demo video should end on the benchmark screen showing recall precision and average context tokens.
