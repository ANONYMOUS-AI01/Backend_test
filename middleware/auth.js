import jwt from 'jsonwebtoken';

const auth = async (req, res, next) => {
	try {
		const token = req.header('Authorization')?.replace('Bearer ', '');
		
		if (!token) {
			throw new Error();
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
		req.adminId = decoded.id;
		next();
	} catch (error) {
		res.status(401).json({ message: 'Authentication required' });
	}
};

export default auth;
