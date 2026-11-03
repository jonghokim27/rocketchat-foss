import type { IMessage, IRoom, IUser } from '@rocket.chat/core-typings';

// Canned responses are a premium feature; a FOSS build leaves the message untouched.
export class BeforeSaveCannedResponse {
	async replacePlaceholders({ message }: { message: IMessage; room: IRoom; user: IUser }): Promise<IMessage> {
		return message;
	}
}
