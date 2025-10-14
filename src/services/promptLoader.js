const fs = require('fs');
const path = require('path');

class PromptLoader {
    constructor() {
        this.promptPath = path.join(process.cwd(), 'prompt.txt');
        this.groupPromptPath = path.join(process.cwd(), 'prompt-groups.txt');
        this.defaultPrompt = 'Eres un asistente virtual útil y amigable. Responde de manera clara y concisa en español.';
    }

    load() {
        try {
            return fs.readFileSync(this.promptPath, 'utf8');
        } catch (error) {
            console.error('Error cargando prompt.txt:', error);
            return this.defaultPrompt;
        }
    }

    loadGroupPrompt() {
        try {
            return fs.readFileSync(this.groupPromptPath, 'utf8');
        } catch (error) {
            console.error('Error cargando prompt-groups.txt:', error);
            return this.defaultPrompt;
        }
    }

    update(newPrompt) {
        try {
            fs.writeFileSync(this.promptPath, newPrompt, 'utf8');
            return true;
        } catch (error) {
            console.error('Error actualizando prompt:', error);
            return false;
        }
    }

    updateGroupPrompt(newPrompt) {
        try {
            fs.writeFileSync(this.groupPromptPath, newPrompt, 'utf8');
            return true;
        } catch (error) {
            console.error('Error actualizando prompt de grupos:', error);
            return false;
        }
    }

    getPrompt(isGroup = false) {
        return isGroup ? this.loadGroupPrompt() : this.load();
    }
}

module.exports = new PromptLoader();