function getInitialDefences() {
  const defences = [
    {
      id: "CHARACTER_LIMIT",
      config: [
        {
          id: "maxMessageLength",
          value: process.env.MAX_MESSAGE_LENGTH || 280,
        },
      ],
    },
    {
      id: "RANDOM_SEQUENCE_ENCLOSURE",
      config: [
        {
          id: "prePrompt",
          value: process.env.RANDOM_SEQ_ENCLOSURE_PRE_PROMPT || "",
        },
        {
          id: "length",
          value: process.env.RANDOM_SEQ_ENCLOSURE_LENGTH || 10,
        },
      ],
    },
    { id: "XML_TAGGING" },
    {
      id: "EMAIL_WHITELIST",
      config: [
        {
          id: "whitelist",
          value: process.env.EMAIL_WHITELIST,
        },
      ],
    },
    {
      id: "SYSTEM_ROLE",
      config: [
        {
          id: "systemRole",
          value: process.env.SYSTEM_ROLE || "",
        },
      ],
    },
  ];
  // make all defences inactive by default and return
  return defences.map((defence) => ({ ...defence, isActive: false }));
}

function activateDefence(id, defences) {
  // return the updated list of defences
  return defences.map((defence) =>
    defence.id === id ? { ...defence, isActive: true } : defence
  );
}

function deactivateDefence(id, defences) {
  // return the updated list of defences
  return defences.map((defence) =>
    defence.id === id ? { ...defence, isActive: false } : defence
  );
}

function configureDefence(id, defences, config) {
  // return the updated list of defences
  return defences.map((defence) =>
    defence.id === id ? { ...defence, config: config } : defence
  );
}

function getConfigValue(defences, defenceId, configId, defaultValue) {
  const configValue = defences
    .find((defence) => defence.id === defenceId)
    ?.config?.find((config) => config.id === configId)?.value;
  return configValue || defaultValue;
}

function getMaxMessageLength(defences) {
  return getConfigValue(defences, "CHARACTER_LIMIT", "maxMessageLength", 280);
}

function getRandomSequenceEnclosurePrePrompt(defences) {
  return getConfigValue(defences, "RANDOM_SEQUENCE_ENCLOSURE", "prePrompt", "");
}

function getRandomSequenceEnclosureLength(defences) {
  return getConfigValue(defences, "RANDOM_SEQUENCE_ENCLOSURE", "length", 10);
}

function getSystemRole(defences) {
  return getConfigValue(defences, "SYSTEM_ROLE", "systemRole", "");
}

function getEmailWhitelistVar(defences) {
  return getConfigValue(defences, "EMAIL_WHITELIST", "whitelist", "");
}

function isDefenceActive(id, defences) {
  return defences.find((defence) => defence.id === id && defence.isActive)
    ? true
    : false;
}

function generate_random_string(string_length) {
  let random_string = "";
  for (let i = 0; i < string_length; i++) {
    const random_ascii = Math.floor(Math.random() * 25 + 97);
    random_string += String.fromCharCode(random_ascii);
  }
  return random_string;
}

// apply random sequence enclosure defense to input message
function transformRandomSequenceEnclosure(message, defences) {
  console.debug("Random Sequence Enclosure defence active.");
  const randomString = generate_random_string(
    getRandomSequenceEnclosureLength(defences)
  );
  const introText = getRandomSequenceEnclosurePrePrompt(defences);
  const transformedMessage = introText.concat(
    randomString,
    " {{ ",
    message,
    " }} ",
    randomString,
    ". "
  );
  return transformedMessage;
}

// function to escape XML characters in user input to prevent hacking with XML tagging on
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
    }
  });
}

// function to detect any XML tags in user input
function detectXMLTags(input) {
  const tagRegex = /<\/?[a-zA-Z][\w\-]*(?:\b[^>]*\/\s*|[^>]*>|[?]>)/g;
  const foundTags = input.match(tagRegex) || [];
  return foundTags.length > 0;
}

// apply XML tagging defence to input message
function transformXmlTagging(message) {
  console.debug("XML Tagging defence active.");
  const openTag = "<user_input>";
  const closeTag = "</user_input>";
  const transformedMessage = openTag.concat(escapeXml(message), closeTag);
  return transformedMessage;
}

//apply defence string transformations to original message
function transformMessage(message, defences) {
  let transformedMessage = message;
  if (isDefenceActive("RANDOM_SEQUENCE_ENCLOSURE", defences)) {
    transformedMessage = transformRandomSequenceEnclosure(
      transformedMessage,
      defences
    );
  }
  if (isDefenceActive("XML_TAGGING", defences)) {
    transformedMessage = transformXmlTagging(transformedMessage);
  }
  if (message == transformedMessage) {
    console.debug("No defences applied. Message unchanged.");
  } else {
    console.debug(
      "Defences applied. Transformed message: " + transformedMessage
    );
  }
  return transformedMessage;
}

// detects triggered defences in original message and blocks the message if necessary
function detectTriggeredDefences(message, defences) {
  // keep track of any triggered defences
  const defenceInfo = { blocked: false, triggeredDefences: [] };
  const maxMessageLength = getMaxMessageLength(defences);
  // check if the message is too long
  if (message.length > maxMessageLength) {
    console.debug("CHARACTER_LIMIT defence triggered.");
    // add the defence to the list of triggered defences
    defenceInfo.triggeredDefences.push("CHARACTER_LIMIT");
    // check if the defence is active
    if (isDefenceActive("CHARACTER_LIMIT", defences)) {
      // block the message
      defenceInfo.blocked = true;
      // return the defence info
      return { reply: "Message is too long", defenceInfo: defenceInfo };
    }
  }

  // check if message contains XML tags
  if (detectXMLTags(message)) {
    console.debug("XML_TAGGING defence triggered.");
    // add the defence to the list of triggered defences
    defenceInfo.triggeredDefences.push("XML_TAGGING");
  }
  return { reply: null, defenceInfo: defenceInfo };
}

module.exports = {
  activateDefence,
  configureDefence,
  deactivateDefence,
  getInitialDefences,
  getSystemRole,
  isDefenceActive,
  transformMessage,
  detectTriggeredDefences,
  getEmailWhitelistVar,
};