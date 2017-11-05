'use strict'
const semver = require('semver')
const debug = require('debug')('bildit:npm-build-job')

module.exports = {
  setupPublishBuildSteps,
  getPublishBuildSteps,
}

async function setupPublishBuildSteps({
  job,
  agent,
  agentInstance,
  directory,
  gitCommander,
  gitCommanderSetup,
}) {
  debug(`sdetup publishing for job %s`, job.id)
  const {artifactPath} = job

  await ensureNoDirtyGitFiles(
    agent,
    agentInstance,
    directory,
    artifactPath,
    gitCommander,
    gitCommanderSetup,
  )
}

function getPublishBuildSteps({
  directory,
  packageJson,
  agentInstance,
  npmCommander,
  npmCommanderSetup,
  gitCommander,
  gitCommanderSetup,
}) {
  debug('npm publishing')

  const transform = command =>
    npmCommander.transformAgentCommand(command, {setup: npmCommanderSetup})

  const buildSteps = []

  buildSteps.push(
    transform({
      agentInstance,
      command: ['npm', 'version', 'patch', '--force', '--no-git-tag-version'],
      cwd: directory,
      returnOutput: true,
    }),
  )

  buildSteps.push(
    transform({
      agentInstance,
      command: ['npm', 'publish', '--access'],
      cwd: directory,
    }),
  )

  buildSteps.push(
    ...getCommitAndPushBuildSteps(
      agentInstance,
      directory,
      packageJson,
      gitCommander,
      gitCommanderSetup,
    ),
  )

  return buildSteps
}

function getCommitAndPushBuildSteps(
  agentInstance,
  directory,
  packageJson,
  gitCommander,
  gitCommanderSetup,
) {
  const {version} = packageJson
  const newVersion = semver.inc(version, 'patch', true)
  debug('npm version is %s, new version will be %s', version, newVersion)

  const message = newVersion

  debug('committing patch changes %s', message)

  const transform = command =>
    gitCommander.transformAgentCommand(command, {setup: gitCommanderSetup})
  const buildSteps = []

  buildSteps.push(
    transform({
      agentInstance,
      command: ['git', 'add', '.'],
      cwd: directory,
    }),
  )
  buildSteps.push(
    transform({
      agentInstance,
      command: ['git', 'commit', '-am', message],
      cwd: directory,
    }),
  )

  debug('pushing to remote repo')

  buildSteps.push(
    transform({
      agentInstance,
      command: ['git', 'push', '--set-upstream', 'origin', 'master'],
      cwd: directory,
    }),
  )

  return buildSteps
}

async function ensureNoDirtyGitFiles(
  agent,
  agentInstance,
  directory,
  artifactPath,
  gitCommander,
  gitCommanderSetup,
) {
  debug('listing diry files of repo in agent %s', agentInstance.id)
  const transform = command =>
    gitCommander.transformAgentCommand(command, {setup: gitCommanderSetup})

  const status = await agent.executeCommand(
    transform({
      agentInstance,
      command: ['git', 'status', '--porcelain'],
      cwd: directory,
      returnOutput: true,
    }),
  )

  if (status.split('\n').filter(l => !!l).length > 0) {
    throw new Error(
      `Cannot publish artifact in ${directory} because it has dirty files:\n${status}`,
    )
  }
}
