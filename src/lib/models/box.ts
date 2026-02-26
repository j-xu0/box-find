import mongoose from 'mongoose';

const boxSchema = new mongoose.Schema({
	id: { type: String, required: true, unique: true },
	contents: { type: String, required: false },
	images: { type: [String], required: false },
	lastModified: { type: Date, required: true }
});

const Box = mongoose.models.Box || mongoose.model('Box', boxSchema);
export default Box;
