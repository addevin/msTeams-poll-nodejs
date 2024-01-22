const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const env = require('dotenv');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

env.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Token generated by Teams
const sharedSecret = process.env.MS_AUTH_TOKEN;
const bufSecret = Buffer.from(sharedSecret, 'base64');

const DB_FILE_PATH = 'db.json';

// Function to read the database file
async function readDb() {
    try {
        const data = await fs.readFile(DB_FILE_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading database:', error.message);
        return { polls: [], activePollId: null };
    }
}

// Function to write to the database file
async function writeDb(data) {
    try {
        await fs.writeFile(DB_FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Error writing to database:', error.message);
    }
}

app.use(bodyParser.json());

function removeHtmlTags(inputString, excludeTags = []) {
    let resultString = inputString;
    // Exclude content inside specific tags
    excludeTags.forEach(tag => {
        const excludePattern = new RegExp(`<${tag}.*?</${tag}>`, 'gs');
        resultString = resultString.replace(excludePattern, '');
    });

    // Remove all HTML tags
    resultString = resultString.replace(/<.*?>/g, '');
    return resultString;
}

app.post('/', async (req, res) => {
    const payload = JSON.stringify(req.body);

    try {
        // Retrieve authorization HMAC information
        const auth = req.headers['authorization'];

        // Calculate HMAC on the message we've received using the shared secret
        const msgBuf = Buffer.from(payload, 'utf8');
        const msgHash = "HMAC " + crypto.createHmac('sha256', bufSecret).update(msgBuf).digest("base64");

        if (msgHash === auth || sharedSecret === auth) {
            const receivedMsg = req.body;
            const receivedText = removeHtmlTags(receivedMsg.text, ['at']);
            console.log('recieved message: ' + receivedText);

            // Read the current state of the database
            let dbData = await readDb();

            switch (true) {
                case receivedText.includes('new poll'): {
                        const pollQuestion = receivedText.replace('new poll', '').trim();

                        const newPoll = {
                            _id: uuidv4(),
                            question: pollQuestion,
                            options: [],
                            votes: [],
                        };

                        // Update the database with the new poll
                        dbData.polls.push(newPoll);
                        dbData.activePollId = newPoll._id;
                        await writeDb(dbData);

                        res.status(200).json({ type: 'message', text: `New poll created with question: "${pollQuestion}"` });
                    
                    break;
                }

                case receivedText.includes('add option'): {
                    const optionText = receivedText.replace('add option', '').trim();

                    if (!dbData.activePollId) {
                        res.status(200).json({ type: 'message', text: 'No active poll. Create a new poll first.' });
                        break;
                    }

                    const activePoll = dbData.polls.find((poll) => poll._id === dbData.activePollId);

                    if (activePoll) {
                        const newOption = { id: (activePoll.options??[]).length+1, text: optionText, votes: [] };
                        activePoll.options.push(newOption);
                        await writeDb(dbData);

                        res.status(200).json({ type: 'message', text: `Option "${optionText}" added to the active poll.` });
                    } else {
                        res.status(200).json({ type: 'message', text: 'Active poll not found.' });
                    }
                    break;
                }

                case receivedText.includes('vote'): {
                    const [optionId, user] = receivedText.replace('vote', '').trim().split(' ');

                    if (!dbData.activePollId) {
                        res.status(200).json({ type: 'message', text: 'No active poll. Create a new poll first.' });
                        break;
                    }

                    const activePoll = dbData.polls.find((poll) => poll._id === dbData.activePollId);

                    if (activePoll) {
                        const option = activePoll.options.find((opt) => opt.id == optionId.trim());

                        if (option) {
                            activePoll.options.forEach((option) => {
                                option.votes.forEach((vote, i) => {
                                    if(vote.user == receivedMsg.from.name){
                                        option.votes.splice(i, 1);
                                    }
                                })
                            })
                            // Store user information along with votes
                            option.votes.push({ user: receivedMsg.from.name, timestamp: new Date() });
                            await writeDb(dbData);

                            res.status(200).json({ type: 'message', text: `Vote recorded for option "${option.text}" by user "${receivedMsg.from.name}".` });
                        } else {
                            res.status(200).json({ type: 'message', text: `Option with ID "${optionId}" not found in the active poll.` });
                        }
                    } else {
                        res.status(200).json({ type: 'message', text: 'Active poll not found.' });
                    }
                    break;
                }

                case receivedText.includes('poll'): {
                    if (!dbData.activePollId) {
                        res.status(200).json({ type: 'message', text: 'No active poll. Create a new poll first.' });
                        break;
                    }

                    const activePoll = dbData.polls.find((poll) => poll._id === dbData.activePollId);

                    if (activePoll) {
                        res.status(200).json({
                            type: 'message',
                            attachments: [{
                                contentType: 'application/vnd.microsoft.card.hero',
                                content: {
                                    title: `Active Poll: ${activePoll.question}`,
                                    subtitle: 'Options:',
                                    text: activePoll.options.map((opt) => `${opt.id} • ${opt.text}`).join('\n'),
                                },
                            }],
                        });
                    } else {
                        res.status(200).json({ type: 'message', text: 'Active poll not found.' });
                    }
                    break;
                }

                default:
                    res.status(200).json({
                        type: 'message',
                        text: `**You typed**: ${receivedMsg.text}\n**Commands supported**: new poll, add option, vote, list poll`,
                    });
            }
        } else {
            res.status(403).json({ type: 'message', text: 'Error: message sender cannot be authenticated.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send(`Error: ${err}`);
    }
});

app.listen(PORT, () => {
    console.log(`Listening on port: ${PORT}`);
});
