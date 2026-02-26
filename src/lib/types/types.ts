export type boxData = {
	id: string;
	contents: string;
	images: string[];
	lastModified: Date;
	__v: number;
};

export type boxDataLean = {
	id: string;
	contents: string;
	images: string[];
};

export type toastData = {
	type: 'error' | 'info' | 'info-square' | 'success' | 'warning' | 'warning-alt';
	title: string;
	subtitle: string;
	caption: string;
	timeout: number;
};

export type toastType = toastData['type'];

export type progressBarStatus = 'active' | 'finished' | 'error';
