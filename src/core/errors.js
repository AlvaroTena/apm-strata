/**
 * CLI Error Classes Module
 *
 * Provides custom error classes for CLI operations.
 *
 * @module src/core/errors
 */

/**
 * Error codes for CLI operations.
 */
export const CLIErrorCode = {
  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',

  // Release errors
  RELEASE_NOT_FOUND: 'RELEASE_NOT_FOUND',
  MANIFEST_MISSING: 'MANIFEST_MISSING',
  MANIFEST_INVALID: 'MANIFEST_INVALID',
  BUNDLE_NOT_FOUND: 'BUNDLE_NOT_FOUND',

  // Config errors
  CONFIG_READ_FAILED: 'CONFIG_READ_FAILED',
  CONFIG_WRITE_FAILED: 'CONFIG_WRITE_FAILED',

  // Metadata errors
  METADATA_READ_FAILED: 'METADATA_READ_FAILED',
  METADATA_WRITE_FAILED: 'METADATA_WRITE_FAILED',
  NOT_INITIALIZED: 'NOT_INITIALIZED',

  // Extraction errors
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',

  // Archive errors
  ARCHIVE_FAILED: 'ARCHIVE_FAILED',

  // Knowledge layer errors
  UNKNOWN_CONSUMER: 'UNKNOWN_CONSUMER',
  UNSUPPORTED_PLATFORM: 'UNSUPPORTED_PLATFORM',
  PREREQUISITE_MISSING: 'PREREQUISITE_MISSING',
  KNOWLEDGE_SETUP_FAILED: 'KNOWLEDGE_SETUP_FAILED',
  TASK_LOG_INVALID: 'TASK_LOG_INVALID'
};

/**
 * Base error class for CLI operations.
 */
export class CLIError extends Error {
  /**
   * Creates a CLIError instance.
   *
   * @param {string} message - Error message.
   * @param {string} code - Error code from CLIErrorCode.
   * @param {Object} [context={}] - Additional context data.
   */
  constructor(message, code, context = {}) {
    super(message);
    this.name = 'CLIError';
    this.code = code;
    this.context = context;
  }

  /**
   * Converts the error to a JSON-serializable object.
   *
   * @returns {Object} JSON representation.
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context
    };
  }

  /**
   * Creates a network error.
   *
   * @param {string} url - URL that failed.
   * @param {string} reason - Failure reason.
   * @returns {CLIError} Formatted error instance.
   */
  static networkError(url, reason) {
    return new CLIError(
      `Network request failed for ${url}: ${reason}`,
      CLIErrorCode.NETWORK_ERROR,
      { url, reason }
    );
  }

  /**
   * Creates a release not found error.
   *
   * @param {string} repo - Repository name.
   * @returns {CLIError} Formatted error instance.
   */
  static releaseNotFound(repo) {
    return new CLIError(
      `No compatible releases found for ${repo}`,
      CLIErrorCode.RELEASE_NOT_FOUND,
      { repo }
    );
  }

  /**
   * Creates a manifest missing error.
   *
   * @param {string} tag - Release tag.
   * @returns {CLIError} Formatted error instance.
   */
  static manifestMissing(tag) {
    return new CLIError(
      `Release ${tag} does not contain apm-release.json`,
      CLIErrorCode.MANIFEST_MISSING,
      { tag }
    );
  }

  /**
   * Creates a manifest invalid error.
   *
   * @param {string} tag - Release tag.
   * @param {string[]} errors - Validation errors.
   * @returns {CLIError} Formatted error instance.
   */
  static manifestInvalid(tag, errors) {
    return new CLIError(
      `Invalid apm-release.json in ${tag}: ${errors.join(', ')}`,
      CLIErrorCode.MANIFEST_INVALID,
      { tag, errors }
    );
  }

  /**
   * Creates a bundle not found error.
   *
   * @param {string} bundleName - Bundle filename.
   * @param {string} tag - Release tag.
   * @returns {CLIError} Formatted error instance.
   */
  static bundleNotFound(bundleName, tag) {
    return new CLIError(
      `Bundle ${bundleName} not found in release ${tag}`,
      CLIErrorCode.BUNDLE_NOT_FOUND,
      { bundleName, tag }
    );
  }

  /**
   * Creates a not initialized error.
   *
   * @returns {CLIError} Formatted error instance.
   */
  static notInitialized() {
    return new CLIError(
      'APM has not been initialized here. Run "apm init" first.',
      CLIErrorCode.NOT_INITIALIZED
    );
  }

  /**
   * Creates a download failed error.
   *
   * @param {string} url - Download URL.
   * @param {string} reason - Failure reason.
   * @returns {CLIError} Formatted error instance.
   */
  static downloadFailed(url, reason) {
    return new CLIError(
      `Failed to download ${url}: ${reason}`,
      CLIErrorCode.DOWNLOAD_FAILED,
      { url, reason }
    );
  }

  /**
   * Creates an extraction failed error.
   *
   * @param {string} file - ZIP file path.
   * @param {string} reason - Failure reason.
   * @returns {CLIError} Formatted error instance.
   */
  static extractionFailed(file, reason) {
    return new CLIError(
      `Failed to extract ${file}: ${reason}`,
      CLIErrorCode.EXTRACTION_FAILED,
      { file, reason }
    );
  }

  /**
   * Creates an archive failed error.
   *
   * @param {string} reason - Failure reason.
   * @returns {CLIError} Formatted error instance.
   */
  static archiveFailed(reason) {
    return new CLIError(
      `Failed to archive session: ${reason}`,
      CLIErrorCode.ARCHIVE_FAILED,
      { reason }
    );
  }

  /**
   * Creates an unknown knowledge consumer error.
   *
   * @param {string} consumer - Consumer identifier that was requested.
   * @param {string[]} available - Supported consumer identifiers.
   * @returns {CLIError} Formatted error instance.
   */
  static unknownConsumer(consumer, available) {
    return new CLIError(
      `Unknown knowledge consumer '${consumer}'. Available: ${available.join(', ')}`,
      CLIErrorCode.UNKNOWN_CONSUMER,
      { consumer, available }
    );
  }

  /**
   * Creates an unsupported platform error.
   *
   * @param {string} platform - Platform reported by process.platform.
   * @param {string} reason - Why the platform cannot be supported.
   * @returns {CLIError} Formatted error instance.
   */
  static unsupportedPlatform(platform, reason) {
    return new CLIError(
      `Unsupported platform ${platform}: ${reason}`,
      CLIErrorCode.UNSUPPORTED_PLATFORM,
      { platform, reason }
    );
  }

  /**
   * Creates a missing prerequisite error.
   *
   * @param {string} tool - Tool that is missing or too old.
   * @param {string} requirement - Human-readable requirement.
   * @param {string} [found] - What was found instead, when known.
   * @returns {CLIError} Formatted error instance.
   */
  static prerequisiteMissing(tool, requirement, found) {
    const suffix = found ? ` Found ${found}.` : '';
    return new CLIError(
      `${tool} ${requirement} is required.${suffix}`,
      CLIErrorCode.PREREQUISITE_MISSING,
      { tool, requirement, found }
    );
  }

  /**
   * Creates a knowledge layer setup error.
   *
   * @param {string} step - Step that failed.
   * @param {string} reason - Failure reason.
   * @returns {CLIError} Formatted error instance.
   */
  static knowledgeSetupFailed(step, reason) {
    return new CLIError(
      `Knowledge layer setup failed during ${step}: ${reason}`,
      CLIErrorCode.KNOWLEDGE_SETUP_FAILED,
      { step, reason }
    );
  }

  /**
   * Creates an invalid task log error.
   *
   * @param {string} file - Task log path.
   * @param {string} reason - What is wrong with it.
   * @returns {CLIError} Formatted error instance.
   */
  static taskLogInvalid(file, reason) {
    return new CLIError(
      `Cannot read claims from ${file}: ${reason}`,
      CLIErrorCode.TASK_LOG_INVALID,
      { file, reason }
    );
  }

}

export default CLIError;
