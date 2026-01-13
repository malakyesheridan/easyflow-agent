import { createJob } from '@/lib/mutations/jobs';
import { createTask } from '@/lib/mutations/tasks';
import { listJobsByStatus } from '@/lib/queries/jobs';
import { listTasksForJob } from '@/lib/queries/tasks';

const ORG_ID = '00000000-0000-0000-0000-000000000000';

async function seedDev() {
  console.log('🌱 Starting dev seed...');

  try {
    // Check if job already exists (safe to re-run)
    const existingJobs = await listJobsByStatus(ORG_ID, 'scheduled');
    if (existingJobs.ok && existingJobs.data.length > 0) {
      const existingJob = existingJobs.data[0];
      console.log(`✅ Job already exists: ${existingJob.id}`);
      console.log('   Skipping seed (safe to re-run)');
      
      // Check tasks
      const tasksResult = await listTasksForJob(existingJob.id, ORG_ID);
      if (tasksResult.ok && tasksResult.data.length > 0) {
        console.log(`✅ ${tasksResult.data.length} tasks already exist`);
      }
      return;
    }

    // Create job
    console.log('📝 Creating job...');
    const jobResult = await createJob({
      orgId: ORG_ID,
      title: 'Sample Glazing Job',
      addressLine1: '123 Main Street',
      suburb: 'Sydney',
      state: 'NSW',
      postcode: '2000',
      status: 'scheduled',
      priority: 'normal',
      scheduledStart: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      scheduledEnd: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(), // Tomorrow + 1 hour
      notes: 'Sample job for development testing',
    });

    if (!jobResult.ok) {
      console.error('❌ Failed to create job:', jobResult.error);
      process.exit(1);
    }

    const job = jobResult.data;
    console.log(`✅ Job created: ${job.id}`);

    // Create tasks in order
    console.log('📝 Creating tasks...');

    const tasks = [
      {
        title: 'Measure site',
        description: 'Take accurate measurements of the installation area',
        order: 1,
        isRequired: true,
      },
      {
        title: 'Cut glass',
        description: 'Cut glass to specified dimensions',
        order: 2,
        isRequired: true,
      },
      {
        title: 'Install glass',
        description: 'Install the glass in the prepared opening',
        order: 3,
        isRequired: true,
      },
      {
        title: 'Cleanup',
        description: 'Clean up work area and dispose of waste materials',
        order: 4,
        isRequired: false,
      },
    ];

    for (const taskData of tasks) {
      const taskResult = await createTask({
        jobId: job.id,
        orgId: ORG_ID,
        title: taskData.title,
        description: taskData.description,
        order: taskData.order,
        isRequired: taskData.isRequired,
        status: 'pending',
      });

      if (!taskResult.ok) {
        console.error(`❌ Failed to create task "${taskData.title}":`, taskResult.error);
        process.exit(1);
      }

      console.log(`✅ Task created: ${taskData.title} (order: ${taskData.order}, required: ${taskData.isRequired})`);
    }

    console.log('🎉 Dev seed completed successfully!');
    console.log(`   Job ID: ${job.id}`);
    console.log(`   Tasks created: ${tasks.length}`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

// Run seed
seedDev()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });

